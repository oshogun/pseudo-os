import Command, { CommandContext } from "../command";

class PwdCommand extends Command {
    description = 'print the current directory';

    run = (ctx: CommandContext): number => {
        ctx.stdout.writeln(ctx.fs.cwd);
        return 0;
    }
}

export default PwdCommand;
