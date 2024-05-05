import Command from "./command";

class CommandRegistry {
    commands: { [key: string]: Command };
  
    constructor() {
      this.commands = {};
    }
  
    registerCommand(name: string, command: Command): void {
      this.commands[name] = command;
    }
  
    getCommand(name: string): Command | undefined {
      return this.commands[name];
    }
  }

  export default CommandRegistry;