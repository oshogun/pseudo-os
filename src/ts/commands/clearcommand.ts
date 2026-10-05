import Command, { CommandContext } from "../command";

class ClearCommand extends Command {
    description = 'clear the terminal screen';

    run = (ctx: CommandContext): number => {
        ctx.shell.requestClear();
        return 0;
    }
}

export default ClearCommand;
