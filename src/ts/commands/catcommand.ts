import Command, { CommandContext, lines } from "../command";
import { parseOptions } from "../shell/options";

class CatCommand extends Command {
    description = 'print files (or stdin) to stdout';
    usage = '[-n] [file...]';

    run = (ctx: CommandContext): number => {
        const { flags, operands } = parseOptions(ctx.args, 'n');
        let lineNumber = 0;
        return this.readInputs(ctx, 'cat', operands, text => {
            if (flags.has('n')) {
                for (const line of lines(text)) {
                    ctx.stdout.writeln(`${String(++lineNumber).padStart(6)}  ${line}`);
                }
            } else {
                ctx.stdout.write(text);
            }
        });
    }
}

export default CatCommand;
