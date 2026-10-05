import Command from "../command";

// `true` and `false`: do nothing, successfully or not.
class ExitCodeCommand extends Command {
    readonly description: string;
    private code: number;

    constructor(code: number) {
        super();
        this.code = code;
        this.description = code === 0 ? 'do nothing, successfully' : 'do nothing, unsuccessfully';
    }

    run = (): number => this.code;
}

export default ExitCodeCommand;
