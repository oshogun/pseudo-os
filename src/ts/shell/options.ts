export interface ParsedOptions {
    flags: Set<string>;
    values: Map<string, string>;
    operands: string[];
}

export class UsageError extends Error {}

// Parses short options POSIX-style: "-rf" sets r and f; options listed in
// `withValue` take an argument ("-n 5" or "-n5"); "--" ends option parsing.
// A bare "-<digits>" is treated as "-n <digits>" when 'n' takes a value.
export function parseOptions(args: string[], flags: string, withValue = ''): ParsedOptions {
    const result: ParsedOptions = { flags: new Set(), values: new Map(), operands: [] };
    let i = 0;
    for (; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--') {
            i++;
            break;
        }
        if (!arg.startsWith('-') || arg === '-') {
            result.operands.push(arg);
            continue;
        }
        if (/^-\d+$/.test(arg) && withValue.includes('n')) {
            result.values.set('n', arg.slice(1));
            continue;
        }
        for (let j = 1; j < arg.length; j++) {
            const option = arg[j];
            if (withValue.includes(option)) {
                const value = arg.slice(j + 1) || args[++i];
                if (value === undefined) {
                    throw new UsageError(`option requires an argument -- '${option}'`);
                }
                result.values.set(option, value);
                break;
            }
            if (!flags.includes(option)) {
                throw new UsageError(`invalid option -- '${option}'`);
            }
            result.flags.add(option);
        }
    }
    result.operands.push(...args.slice(i));
    return result;
}
