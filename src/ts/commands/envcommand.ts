import Command, { CommandContext } from "../command";

class EnvCommand extends Command {
    description = 'print environment variables';

    run = (ctx: CommandContext): number => {
        for (const [name, value] of [...ctx.shell.env].sort()) {
            ctx.stdout.writeln(`${name}=${value}`);
        }
        return 0;
    }
}

export default EnvCommand;
