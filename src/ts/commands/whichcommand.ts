import Command, { CommandContext } from "../command";

class WhichCommand extends Command {
    description = 'show where a command lives';
    usage = '<command>...';

    run = (ctx: CommandContext): number => {
        let status = 0;
        for (const name of ctx.args) {
            if (ctx.shell.registry.getCommand(name)) {
                ctx.stdout.writeln(`/bin/${name}`);
            } else {
                ctx.stderr.writeln(`which: no ${name} in (/bin)`);
                status = 1;
            }
        }
        return status;
    }
}

export default WhichCommand;
