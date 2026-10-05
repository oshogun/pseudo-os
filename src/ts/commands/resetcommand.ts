import Command, { CommandContext } from "../command";

class ResetCommand extends Command {
    description = 'erase all changes and restore the original files';
    usage = '--yes';

    run = (ctx: CommandContext): number => {
        if (ctx.args[0] !== '--yes' || !ctx.shell.factoryReset) {
            ctx.stderr.writeln('reset: this deletes every file you created. Run "reset --yes" to confirm.');
            return 1;
        }
        ctx.shell.factoryReset();
        ctx.shell.requestClear();
        return 0;
    }
}

export default ResetCommand;
