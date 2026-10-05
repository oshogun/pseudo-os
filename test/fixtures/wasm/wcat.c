// Prints files named on the command line (or stdin), like cat.
#include <stdio.h>
#include <string.h>
#include <errno.h>

static int copy(FILE *in) {
    char buf[4096];
    size_t n;
    while ((n = fread(buf, 1, sizeof buf, in)) > 0) {
        fwrite(buf, 1, n, stdout);
    }
    return ferror(in) ? 1 : 0;
}

int main(int argc, char **argv) {
    int status = 0;
    if (argc < 2) {
        return copy(stdin);
    }
    for (int i = 1; i < argc; i++) {
        FILE *f = fopen(argv[i], "rb");
        if (!f) {
            fprintf(stderr, "wcat: %s: %s\n", argv[i], strerror(errno));
            status = 1;
            continue;
        }
        status |= copy(f);
        fclose(f);
    }
    return status;
}
