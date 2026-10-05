import Command, { CommandContext, lines } from "../command";
import { parseOptions, UsageError } from "../shell/options";

class GrepCommand extends Command {
    description = 'print lines matching a regular expression';
    usage = '[-i] [-v] [-n] [-c] <pattern> [file...]';

    run = (ctx: CommandContext): number => {
        const { flags, operands } = parseOptions(ctx.args, 'ivnc');
        if (operands.length < 1) {
            throw new UsageError('missing pattern');
        }
        const [source, ...files] = operands;
        let regex: RegExp;
        try {
            regex = new RegExp(source, flags.has('i') ? 'i' : '');
        } catch {
            ctx.stderr.writeln(`grep: invalid regular expression: ${source}`);
            return 2;
        }
        const prefixFile = files.length > 1;
        let matched = false;
        const status = this.readInputs(ctx, 'grep', files, (text, file) => {
            let count = 0;
            lines(text).forEach((line, index) => {
                if (regex.test(line) === flags.has('v')) {
                    return;
                }
                count++;
                if (!flags.has('c')) {
                    const prefix = (prefixFile ? `${file}:` : '') + (flags.has('n') ? `${index + 1}:` : '');
                    ctx.stdout.writeln(prefix + line);
                }
            });
            if (flags.has('c')) {
                ctx.stdout.writeln((prefixFile ? `${file}:` : '') + count);
            }
            matched ||= count > 0;
        });
        return status !== 0 ? 2 : matched ? 0 : 1;
    }
}

export default GrepCommand;
