import Command, { CommandContext } from "../command";

// A command that prints a fixed (or computed) line and ignores its arguments.
// Used for whoami, hostname and friends.
class PrintCommand extends Command {
    readonly description: string;
    private text: (ctx: CommandContext) => string;

    constructor(description: string, text: (ctx: CommandContext) => string) {
        super();
        this.description = description;
        this.text = text;
    }

    run = (ctx: CommandContext): number => {
        ctx.stdout.writeln(this.text(ctx));
        return 0;
    }
}

export default PrintCommand;
