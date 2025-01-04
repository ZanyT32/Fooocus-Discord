const fs = require('fs');
const path = require('path');

module.exports = (client) => {
    client.handleCommands = async () => {
        console.log('Loading commands');

        const commandsPath = './src/commands';
        const { commands, commandArray } = client;

        // Get all items (files and folders) in the commands directory
        const commandItems = fs.readdirSync(commandsPath);

        for (const item of commandItems) {
            const itemPath = path.join(commandsPath, item);

            if (fs.statSync(itemPath).isDirectory()) {
                // If the item is a directory, load commands from it
                const commandFiles = fs.readdirSync(itemPath).filter(file => file.endsWith('.js'));
                for (const file of commandFiles) {
                    console.log(` - loading ${item}/${file}`);
                    const command = require(`../../commands/${item}/${file}`);
                    commands.set(command.data.name, command);
                    commandArray.push(command.data.toJSON());
                }
            } else if (item.endsWith('.js')) {
                // If the item is a file, load it as a command
                console.log(` - loading ${item}`);
                const command = require(`../../commands/${item}`);
                commands.set(command.data.name, command);
                commandArray.push(command.data.toJSON());
            }
        }
    };
};