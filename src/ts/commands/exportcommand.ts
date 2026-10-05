import Command, { CommandContext } from "../command";

const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

class ExportCommand extends Command {
    description = 'set environment variables';
    usage = '[NAME=value...]';

    run = (ctx: CommandContext): number => {
        const env = ctx.shell.env;
        if (ctx.args.length === 0) {
            for (const [name, value] of [...env].sort()) {
                ctx.stdout.writeln(`export ${name}="${value}"`);
            }
            return 0;
        }
        let status = 0;
        for (const arg of ctx.args) {
            const eq = arg.indexOf('=');
            const name = eq === -1 ? arg : arg.slice(0, eq);
            if (!namePattern.test(name)) {
                ctx.stderr.writeln(`export: '${arg}': not a valid identifier`);
                status = 1;
                continue;
            }
            if (eq !== -1) {
                env.set(name, arg.slice(eq + 1));
            } else if (!env.has(name)) {
                env.set(name, '');
            }
        }
        return status;
    }
}

export default ExportCommand;
