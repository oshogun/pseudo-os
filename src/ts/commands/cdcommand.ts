import Command, { CommandContext } from "../command";

class CdCommand extends Command {
    description = 'change the current directory';
    usage = '[directory | -]';

    run = (ctx: CommandContext): number => {
        if (ctx.args.length > 1) {
            ctx.stderr.writeln('cd: too many arguments');
            return 1;
        }
        let target = ctx.args[0] ?? ctx.shell.home;
        if (target === '-') {
            target = ctx.shell.env.get('OLDPWD') ?? ctx.fs.cwd;
            ctx.shell.changeDirectory(target);
            ctx.stdout.writeln(ctx.fs.cwd);
            return 0;
        }
        ctx.shell.changeDirectory(target);
        return 0;
    }
}

export default CdCommand;
