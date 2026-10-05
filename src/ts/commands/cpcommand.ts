import Command, { CommandContext } from "../command";
import { FsError } from "../fs/filesystem";
import { parseOptions, UsageError } from "../shell/options";

class CpCommand extends Command {
    description = 'copy files and directories';
    usage = '[-r] <source>... <destination>';

    run = (ctx: CommandContext): number => {
        const { flags, operands } = parseOptions(ctx.args, 'rR');
        if (operands.length < 2) {
            throw new UsageError('missing file operand');
        }
        const sources = operands.slice(0, -1);
        const destination = operands[operands.length - 1];
        if (sources.length > 1 && !ctx.fs.isDirectory(destination)) {
            throw new FsError('ENOTDIR', destination);
        }
        const recursive = flags.has('r') || flags.has('R');
        return this.forEach(ctx, 'cp', sources, source => {
            if (!recursive && ctx.fs.isDirectory(source)) {
                throw new FsError('EISDIR', source, `-r not specified; omitting directory '${source}'`);
            }
            ctx.fs.copy(source, destination, recursive);
        });
    }
}

export default CpCommand;
