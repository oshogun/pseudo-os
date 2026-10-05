import Command, { CommandContext } from "../command";
import Directory from "../fs/directory";
import { FsError } from "../fs/filesystem";
import { parseOptions, UsageError } from "../shell/options";

class RmCommand extends Command {
    description = 'remove files or directories';
    usage = '[-r] [-f] <path>...';

    run = (ctx: CommandContext): number => {
        const { flags, operands } = parseOptions(ctx.args, 'rRf');
        const recursive = flags.has('r') || flags.has('R');
        const force = flags.has('f');
        if (operands.length < 1 && !force) {
            throw new UsageError('missing operand');
        }
        return this.forEach(ctx, 'rm', operands, path => {
            const node = ctx.fs.find(path);
            if (!node) {
                if (force) {
                    return;
                }
                throw new FsError('ENOENT', path);
            }
            if (node instanceof Directory && !recursive) {
                throw new FsError('EISDIR', path);
            }
            if (node === ctx.fs.root) {
                throw new FsError('EINVAL', path, "refusing to remove '/'");
            }
            ctx.fs.remove(path, recursive);
        });
    }
}

export default RmCommand;
