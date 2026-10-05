// Exercises args, environment, clock, random, file writing and exit codes.
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <unistd.h>

int main(int argc, char **argv) {
    printf("argc=%d\n", argc);
    for (int i = 0; i < argc; i++) {
        printf("argv[%d]=%s\n", i, argv[i]);
    }
    const char *home = getenv("HOME");
    printf("HOME=%s\n", home ? home : "(unset)");
    printf("time_ok=%d\n", time(NULL) > 1600000000);
    unsigned char r[8];
    printf("random_ok=%d\n", getentropy(r, sizeof r) == 0);
    FILE *out = fopen("written.txt", "w");
    if (out) {
        fprintf(out, "written by wasm\n");
        fclose(out);
    }
    char cwd[256];
    printf("cwd=%s\n", getcwd(cwd, sizeof cwd) ? cwd : "(error)");
    return argc > 1 ? atoi(argv[1]) : 0;
}
