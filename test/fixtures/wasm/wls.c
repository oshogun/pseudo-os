// Lists a directory with file sizes, then renames and removes files, to
// exercise readdir, stat, mkdir, rename and unlink.
#include <dirent.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

int main(int argc, char **argv) {
    const char *dir = argc > 1 ? argv[1] : ".";
    DIR *d = opendir(dir);
    if (!d) {
        perror(dir);
        return 1;
    }
    struct dirent *e;
    while ((e = readdir(d)) != NULL) {
        if (e->d_name[0] == '.') {
            continue;
        }
        char path[512];
        snprintf(path, sizeof path, "%s/%s", dir, e->d_name);
        struct stat st;
        if (stat(path, &st) != 0) {
            perror(path);
            continue;
        }
        printf("%s %s %lld\n", S_ISDIR(st.st_mode) ? "d" : "f", e->d_name, (long long)st.st_size);
    }
    closedir(d);

    if (argc > 2 && strcmp(argv[2], "--shuffle") == 0) {
        mkdir("made", 0755);
        rename("a.txt", "made/renamed.txt");
        unlink("b.txt");
    }
    return 0;
}
