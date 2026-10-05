import Command, { CommandContext } from "../command";

class UnsetCommand extends Command {
    description = 'remove environment variables';
    usage = '<NAME>...';

    run = (ctx: CommandContext): number => {
        for (const name of ctx.args) {
            ctx.shell.env.delete(name);
        }
        return 0;
    }
}

export default UnsetCommand;
