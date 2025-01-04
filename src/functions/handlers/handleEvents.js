const fs = require('fs');
const path = require('path');

module.exports = (client) => {
    client.handleEvents = async () => {
        console.log('Loading events...');

        const eventsPath = './src/events';
        const eventItems = fs.readdirSync(eventsPath);

        for (const item of eventItems) {
            const itemPath = path.join(eventsPath, item);

            if (fs.statSync(itemPath).isDirectory()) {
                // If the item is a directory, handle events inside it
                const eventFiles = fs.readdirSync(itemPath).filter(file => file.endsWith('.js'));
                for (const file of eventFiles) {
                    const event = require(`../../events/${item}/${file}`);
                    if (event.once) {
                        client.once(event.name, (...args) => event.execute(...args, client));
                    } else {
                        client.on(event.name, (...args) => event.execute(...args, client));
                    }
                    console.log(`Loaded event: ${item}/${file}`);
                }
            } else if (item.endsWith('.js')) {
                // If the item is a file, handle it as an event
                const event = require(`../../events/${item}`);
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args, client));
                } else {
                    client.on(event.name, (...args) => event.execute(...args, client));
                }
                console.log(`Loaded event: ${item}`);
            }
        }
    };
};