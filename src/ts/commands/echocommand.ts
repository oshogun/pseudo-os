import Command, { CommandContext } from "../command";

class EchoCommand extends Command {
    description = 'print arguments';
    usage = '[-n] [text...]';

    run = (ctx: CommandContext): number => {
        const newline = ctx.args[0] !== '-n';
        const text = (newline ? ctx.args : ctx.args.slice(1)).join(' ');
        ctx.stdout.write(newline ? text + '\n' : text);
        return 0;
    }
}

export default EchoCommand;
