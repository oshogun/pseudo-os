import Command, { CommandContext } from "../command";

class HelpCommand extends Command {
    description = 'list available commands';
    usage = '[command]';

    run = (ctx: CommandContext): number => {
        const registry = ctx.shell.registry;
        if (ctx.args.length > 0) {
            const name = ctx.args[0];
            const command = registry.getCommand(name);
            if (!command) {
                ctx.stderr.writeln(`help: no help topics match '${name}'`);
                return 1;
            }
            ctx.stdout.writeln(`usage: ${name} ${command.usage}`.trimEnd());
            ctx.stdout.writeln(command.description);
            return 0;
        }
        const names = registry.names();
        const width = Math.max(...names.map(n => n.length));
        for (const name of names) {
            ctx.stdout.writeln(`  ${name.padEnd(width)}  ${registry.getCommand(name)!.description}`);
        }
        ctx.stdout.writeln();
        ctx.stdout.writeln('Pipes (|), redirects (> >> < 2>), ; && || and $VARIABLES are supported.');
        ctx.stdout.writeln("Run 'help <command>' or '<command> --help' for details.");
        return 0;
    }
}

export default HelpCommand;
