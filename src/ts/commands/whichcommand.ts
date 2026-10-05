import Command, { CommandContext } from "../command";

class WhichCommand extends Command {
    description = 'show where a command lives';
    usage = '<command>...';

    run = (ctx: CommandContext): number => {
        let status = 0;
        for (const name of ctx.args) {
            const program = ctx.shell.findProgram(name);
            if (ctx.shell.registry.getCommand(name)) {
                ctx.stdout.writeln(`/bin/${name}`);
            } else if (program) {
                ctx.stdout.writeln(program.path);
            } else {
                ctx.stderr.writeln(`which: no ${name} in (/bin)`);
                status = 1;
            }
        }
        return status;
    }
}

export default WhichCommand;
