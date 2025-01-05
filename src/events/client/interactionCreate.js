const imagine = require("../../commands/imagine");

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client){
        if (interaction.isChatInputCommand()) {
            const { commands } = client;
            const { commandName } = interaction;
            const command = commands.get(commandName);
            if (!command) {
                return;
            }

            try {
                await command.execute(interaction, client);
            } catch (error) {
                console.error(error);
                try {
                    await interaction.reply({
                        content: 'Something went wrong...',
                        ephemeral: true
                    });
                } catch (error) {
                    await interaction.followUp({
                        content: 'Something went wrong...',
                        ephemeral: true
                    });
                }
            }
        } else if (interaction.isButton() && interaction.customId.startsWith('regenerate-')){

            await interaction.deferReply();

            const interactionId = interaction.customId.split('-')[1];
            const options = interaction.client.optionsMap.get(interactionId);
            
            let queueEntry ={
                user: interaction.user.username,
                interaction: interaction,
                prompt: options.prompt,
                negative: options.negative,
                style: options.style,
                speed: options.speed,
                seed: null
            }
            imagine.processQueue(queueEntry);
        }
    }
}
