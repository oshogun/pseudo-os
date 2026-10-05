import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Agent run clones (.claude/run-clones/) hold full copies of test/;
        // without this, `npm test` in the main checkout runs their suites too.
        exclude: [...configDefaults.exclude, '.claude/**'],
    },
});
