#ifdef __APPLE__
#define _DARWIN_C_SOURCE
#else
#define _POSIX_C_SOURCE 200809L
#endif
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

#ifdef __APPLE__
#include <util.h>
#else
#include <pty.h>
#endif

#define CTRL_FD 3

static volatile sig_atomic_t g_should_stop = 0;

static void handle_stop_signal(int sig) {
  (void)sig;
  g_should_stop = 1;
}

static int set_nonblock(int fd) {
  int flags = fcntl(fd, F_GETFL, 0);
  if (flags < 0) return -1;
  return fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

static int write_all(int fd, const char *buf, size_t len) {
  size_t total = 0;
  while (total < len) {
    ssize_t n = write(fd, buf + total, len - total);
    if (n > 0) {
      total += (size_t)n;
      continue;
    }
    if (n < 0 && errno == EINTR) continue;
    if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
      struct pollfd pfd = { .fd = fd, .events = POLLOUT, .revents = 0 };
      poll(&pfd, 1, 100);
      continue;
    }
    return -1;
  }
  return 0;
}

static void apply_winsize(int master_fd, pid_t child_pid, int cols, int rows) {
  if (cols <= 0 || rows <= 0) return;
  struct winsize ws;
  memset(&ws, 0, sizeof(ws));
  ws.ws_col = (unsigned short)cols;
  ws.ws_row = (unsigned short)rows;
  (void)ioctl(master_fd, TIOCSWINSZ, &ws);

  pid_t fg_pgrp = tcgetpgrp(master_fd);
  if (fg_pgrp > 0) {
    (void)killpg(fg_pgrp, SIGWINCH);
  } else if (child_pid > 0) {
    (void)kill(child_pid, SIGWINCH);
  }
}

static void drain_master(int master_fd) {
  char buf[32768];
  for (;;) {
    ssize_t n = read(master_fd, buf, sizeof(buf));
    if (n > 0) {
      if (write_all(STDOUT_FILENO, buf, (size_t)n) < 0) break;
      continue;
    }
    if (n < 0 && errno == EINTR) continue;
    break;
  }
}

int main(int argc, char **argv) {
  if (argc < 4) {
    fprintf(stderr, "Usage: %s <cwd> <cols> <rows>\n", argv[0]);
    return 2;
  }

  const char *cwd = argv[1];
  int cols = atoi(argv[2]);
  int rows = atoi(argv[3]);
  if (cols < 10) cols = 80;
  if (rows < 4) rows = 24;

  struct winsize ws;
  memset(&ws, 0, sizeof(ws));
  ws.ws_col = (unsigned short)cols;
  ws.ws_row = (unsigned short)rows;

  int master_fd = -1;
  pid_t child_pid = forkpty(&master_fd, NULL, NULL, &ws);
  if (child_pid < 0) {
    perror("forkpty");
    return 1;
  }

  if (child_pid == 0) {
    signal(SIGPIPE, SIG_DFL);
    signal(SIGINT, SIG_DFL);
    signal(SIGTERM, SIG_DFL);
    signal(SIGHUP, SIG_DFL);
    signal(SIGQUIT, SIG_DFL);

    close(CTRL_FD);
    if (chdir(cwd) != 0) {
      /* Fallback to current dir if cwd cannot be entered */
    }
    const char *shell = getenv("SHELL");
    if (!shell || shell[0] == '\0') shell = "/bin/zsh";
    execl(shell, shell, "-l", (char *)NULL);
    _exit(127);
  }

  signal(SIGPIPE, SIG_IGN);
  struct sigaction sa;
  memset(&sa, 0, sizeof(sa));
  sa.sa_handler = handle_stop_signal;
  sigaction(SIGTERM, &sa, NULL);
  sigaction(SIGINT, &sa, NULL);
  sigaction(SIGHUP, &sa, NULL);

  (void)set_nonblock(master_fd);
  (void)set_nonblock(STDIN_FILENO);
  int ctrl_active = (fcntl(CTRL_FD, F_GETFD) != -1);
  if (ctrl_active) {
    (void)set_nonblock(CTRL_FD);
  }

  char io_buf[32768];
  char ctrl_buf[256];
  size_t ctrl_len = 0;
  int stdin_open = 1;
  int exit_code = 0;

  while (!g_should_stop) {
    struct pollfd pfds[3];
    nfds_t nfds = 0;
    int master_idx = -1;
    int stdin_idx = -1;
    int ctrl_idx = -1;

    master_idx = (int)nfds;
    pfds[nfds++] = (struct pollfd){ .fd = master_fd, .events = POLLIN, .revents = 0 };

    if (stdin_open) {
      stdin_idx = (int)nfds;
      pfds[nfds++] = (struct pollfd){ .fd = STDIN_FILENO, .events = POLLIN, .revents = 0 };
    }
    if (ctrl_active) {
      ctrl_idx = (int)nfds;
      pfds[nfds++] = (struct pollfd){ .fd = CTRL_FD, .events = POLLIN, .revents = 0 };
    }

    int ready = poll(pfds, nfds, 250);
    if (ready < 0) {
      if (errno == EINTR) continue;
      break;
    }

    if (master_idx >= 0 && (pfds[master_idx].revents & (POLLIN | POLLHUP | POLLERR))) {
      ssize_t n = read(master_fd, io_buf, sizeof(io_buf));
      if (n > 0) {
        if (write_all(STDOUT_FILENO, io_buf, (size_t)n) < 0) break;
      } else if (n == 0 || (n < 0 && errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR)) {
        break;
      }
    }

    if (stdin_idx >= 0 && (pfds[stdin_idx].revents & (POLLIN | POLLHUP | POLLERR))) {
      ssize_t n = read(STDIN_FILENO, io_buf, sizeof(io_buf));
      if (n > 0) {
        if (write_all(master_fd, io_buf, (size_t)n) < 0) break;
      } else if (n == 0) {
        stdin_open = 0;
        g_should_stop = 1;
        break;
      } else if (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
        stdin_open = 0;
        g_should_stop = 1;
        break;
      }
    }

    if (ctrl_idx >= 0 && (pfds[ctrl_idx].revents & (POLLIN | POLLHUP | POLLERR))) {
      char chunk[256];
      ssize_t n = read(CTRL_FD, chunk, sizeof(chunk));
      if (n > 0) {
        size_t copy_len = (size_t)n;
        if (ctrl_len + copy_len >= sizeof(ctrl_buf)) {
          ctrl_len = 0;
        }
        if (copy_len < sizeof(ctrl_buf)) {
          memcpy(ctrl_buf + ctrl_len, chunk, copy_len);
          ctrl_len += copy_len;
          ctrl_buf[ctrl_len] = '\0';

          char *start = ctrl_buf;
          char *nl;
          while ((nl = strchr(start, '\n')) != NULL) {
            *nl = '\0';
            int new_cols = 0, new_rows = 0;
            if (sscanf(start, "%d %d", &new_cols, &new_rows) == 2) {
              apply_winsize(master_fd, child_pid, new_cols, new_rows);
            }
            start = nl + 1;
          }
          size_t rem = strlen(start);
          if (rem > 0 && start != ctrl_buf) {
            memmove(ctrl_buf, start, rem);
          }
          ctrl_len = rem;
        }
      } else if (n == 0) {
        ctrl_active = 0;
      }
    }

    int status = 0;
    pid_t done = waitpid(child_pid, &status, WNOHANG);
    if (done == child_pid) {
      drain_master(master_fd);
      if (WIFEXITED(status)) {
        exit_code = WEXITSTATUS(status);
      } else if (WIFSIGNALED(status)) {
        exit_code = 128 + WTERMSIG(status);
      }
      child_pid = -1;
      break;
    }
  }

  if (child_pid > 0) {
    (void)kill(child_pid, SIGHUP);
    (void)kill(child_pid, SIGTERM);
    int status = 0;
    (void)waitpid(child_pid, &status, WNOHANG);
  }
  close(master_fd);
  return exit_code;
}
