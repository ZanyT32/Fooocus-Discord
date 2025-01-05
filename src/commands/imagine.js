const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const styles = require('../common/fooocusStyles');
const url = process.env.fooocusURL;
let running = false;
let queue = [];
let processingQueue = false;
/*
	CSS Selectors for Puppeteer to use
		May need updating in future to keep up with fooocus HTML/CSS
		Confirmed accurate as of Jan 2, 2025, fooocus V2.5.5 released Aug 12, 2024
*/
let ADVANCED_CHECKBOX = "#component-23 > label > input"
let IMAGE_AMOUNT = "#component-221 > div > div > input[type='number']"
let SEED_BOX = "#component-224 > label > input"
let SEED_INPUT = "#component-225 > label > input"
let NEGATIVE_INPUT = "#negative_prompt > label > textarea"
let PROMPT_BOX = "[data-testid='textbox']"
let GENERATE_BUTTON = "#generate_button"
let GENERATED_IMAGE = "div#final_gallery > div.grid-wrap > div.grid-container > button.thumbnail-item > img"
let STYLE_TAB = "#component-335 > .tab-nav > button:nth-child(2)"
let STYLE_CHECKBOX = "#component-231 > div[data-testid='checkbox-group'] > label:nth-child({n}) > input"
const FooocusPerformance = {
	Quality: "[data-testid='Quality-radio-label']", 
	Speed: "[data-testid='Speed-radio-label']", 
	ExtremeSpeed: "[data-testid='Extreme Speed-radio-label']", 
	Lightning: "[data-testid='Lightning-radio-label']", 
	HyperSD: "[data-testid='Hyper-SD-radio-label']" 
}

/*
	Configuration values
*/

// ---How long to let fooocus generate an image before timing out in milliseconds
// -----
let generateTimeout = 0 // No timeout
//let generateTimeout = 120000 // 2 minute timeout

// --- Default performance option, determines speed of generation, faster settings may lessen quality
// -----
//let defaultPerformance = 'Quality' // Quality: 0.5x speed (60 iterations)
//let defaultPerformance = 'Speed' // Speed: base performance with 30 iterations
//let defaultPerformance = 'ExtremeSpeed' // Extreme Speed: 2x speed (15 iterations)
let defaultPerformance = 'Lightning' // Lightning: 3.75x speed (8 iterations)
//let defaultPerformance = 'HyperSD' // Hyper-SD: 7.5x speed (4 iterations), requires Hyper SD lora which will download on first use if not already downloaded

async function generateImage (withPrompt, styleId, performance, seedCustom = -1, negative = null) {
	/*if (running) {
		return "Error: Already running"
	}*/
	
	/*if (styleId == null) {
		styleId = 1
	}*/

	if (seedCustom == null) {
		seedCustom = -1
	}

	if (performance == null) {
		performance = defaultPerformance
	}

	running = true;

    const browser = await puppeteer.launch({});
	const page = await browser.newPage();
	await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url);

	//used when debugging to allow console.log inside page.evaluate() to output to hte Node terminal
	/*page.on('console', async (msg) => {
        const msgArgs = msg.args();
        const logValues = await Promise.all(msgArgs.map(async arg => await arg.jsonValue()));
        console.log(...logValues);
    });*/

	await page.waitForSelector(PROMPT_BOX);
	await page.type(PROMPT_BOX, withPrompt);
	
	//open advanced tab by checking the checkbox
	await page.waitForSelector(ADVANCED_CHECKBOX);
	await page.click(ADVANCED_CHECKBOX);

	//input the number of image to genearte
	// await page.waitForSelector("#component-17 > div.wrap.svelte-1cl284s > div > input"); 
	// await page.type("#component-17 > div.wrap.svelte-1cl284s > div > input", "1");
	
	//Set Performance
	await page.waitForSelector(FooocusPerformance[performance])
	await page.$eval(FooocusPerformance[performance], (e) => {
		e.click()
	})


	if (seedCustom != -1) {
		console.log("setting seed to: " + seedCustom)
		await page.waitForSelector(SEED_BOX);
		await page.$eval(SEED_BOX, (e) => {
			e.click()
		})

		await page.waitForSelector(SEED_INPUT);
		await page.click(SEED_INPUT, {clickCount: 3})
		await page.type(SEED_INPUT, seedCustom);

	}

	if (negative != null && ['Quality', 'Speed'].includes(performance)) {
		await page.waitForSelector(NEGATIVE_INPUT);
		
		await page.click(NEGATIVE_INPUT, {clickCount: 3})
		await page.type(NEGATIVE_INPUT, negative);
	}

	//change the amount of images generated
	await page.waitForSelector(IMAGE_AMOUNT)
	await page.click(IMAGE_AMOUNT);
	await page.keyboard.press('Backspace');
	await page.type(IMAGE_AMOUNT, "1");

	// //input the style of image to generate
	if (styleId != null) {
		try {
			await page.waitForSelector(STYLE_TAB);
			await page.$eval(STYLE_TAB, (e) => {
				e.click()
			})
	
			// Remove the default fooocus styles and add the chosen style
			await page.evaluate((styleId) => {
				const labels = document.querySelectorAll('#component-231 > div[data-testid="checkbox-group"] > label');
				for (let label of labels) {
					if (label.innerHTML.includes(styleId)) {
						label.click();
					} else if (label.innerHTML.includes('Fooocus V2')){
						label.click();
					} else if (label.innerHTML.includes('Fooocus Enhance')){
						label.click();
					} else if (label.innerHTML.includes('Fooocus Sharp')){
						label.click();
					}
				}
			}, styleId);
		}
		catch (e) {
			console.log("unable to apply style");
		}
	}


	//click button to generate, wait for image to generate
	await page.click(GENERATE_BUTTON);

	//grab the src from the img
	await page.waitForSelector(GENERATED_IMAGE, {timeout: generateTimeout});
	const src = await page.evaluate((selector) => {
		console.log(selector);		
		const imgSrc = document.querySelector(selector).src;
		return imgSrc;
	}, GENERATED_IMAGE);

	let seed = -1
	//get the seed if possible
	try {
		await page.waitForSelector(SEED_BOX);
		await page.$eval(SEED_BOX, (e) => {
			e.click()
		})
		await page.waitForSelector(SEED_INPUT);
		seed = await page.$eval(SEED_INPUT, (e) => {
			return e.value;
		});
	}
	catch (e) {
		console.log("button not found")
	}

	//download the image
	const viewSource = await page.goto(src);
	//as png file
	//use a datetime filename into /output folder
	const filename = `./output/${new Date().getTime()}.png`;
	fs.writeFile(filename, await viewSource.buffer(), (err) => err && console.error(err));

    browser.close();
	running = false;

	//remove ./output/ from the filename before returning
	return {
		filename: filename, 
		seed: seed
	}
}

async function run(interaction, prompt, style, performance, cmdSeed, negative){
	
	const name = interaction.user.username;



	// --- Generate image
	// ----
	let start = new Date().getTime();
	let imagejson = await generateImage(
		prompt,
		style,
		performance,
		cmdSeed,
		negative
	);
	const end = new Date().getTime();

	let image = imagejson.filename;
	let seed = imagejson.seed;
	let attachment = new AttachmentBuilder(image);



	// --- Response
	// ----

	//Calculate and format generation time
	let totalSec = (end - start) / 1000;
	let totalStr = '';
	if (totalSec > 60) {
		let mins = Math.floor(totalSec / 60)
		let remainSec = totalSec - (mins * 60)
		totalStr = `${mins}m ${remainSec.toFixed(1)}s`
	} else {
		totalStr = totalSec.toFixed(1) + 's';
	}

	//Build response embed
	const embed = new EmbedBuilder()
	.setColor("Random")
	.setAuthor({ name: name, iconURL: interaction.user.avatarURL() })
	.setTitle(prompt)
	.setDescription(`Time: ${totalStr}\nSeed: ${seed}\n${ negative ? "Negative: " + negative: ""}`)
	.setImage(`attachment://${image.substring(9)}`)
	.setFooter({ text: `${name} used /imagine`, iconURL: interaction.user.avatarURL() })
	.setTimestamp()

	const options = {
		prompt: prompt,
		style: style,
		speed: performance,
		negative: negative,
		seed: seed
	}
	if (!interaction.client.optionsMap) {
		interaction.client.optionsMap = new Map();
	}
	interaction.client.optionsMap.set(interaction.id, options);

	const regenerateButton = new ButtonBuilder()
	.setCustomId(`regenerate-${interaction.id}`)
	.setLabel('Regenerate')
	.setStyle(ButtonStyle.Primary)

	const row = new ActionRowBuilder()
	.addComponents(regenerateButton)

	// Send image
	await interaction.followUp({ 
		content: `${interaction.user} your image is ready!`, 
		embeds: [embed], 
		files: [attachment],
		components: [row] 
	});

	seed = '';
}

async function processQueue(queueEntry){
	
	// Add request to the queue
	queue.push(queueEntry);

	// --- Send an initial response to the user to let them know their image is on the way
	// -----
	let repl = `Your image is on its way!\n\n`
	repl += 'Prompt: `' + queueEntry.prompt + "`\n"
	repl += `Negative: ${ queueEntry.negative ? "`" + queueEntry.negative + "`" : "n/a"}` + "\n"
	repl += `Style: ${ queueEntry.style ? "`" + queueEntry.style + "`" : "n/a"}` + "\n"
	repl += `Speed: ${ queueEntry.performance ? "`" + queueEntry.performance + "`" : "`" + defaultPerformance + "`"}`  + "\n"
	
	if (queueEntry.interaction.replied || queueEntry.interaction.deferred) {
		await queueEntry.interaction.followUp(repl);
	} else {
		await queueEntry.interaction.reply(repl);
	}

	if (queueEntry.negative && !['Quality', 'Speed'].includes(queueEntry.performance)){
		await queueEntry.interaction.followUp(
			{content: 'You supplied a negative prompt, but chose a speed option that does not support negative prompts.\nImage will generate without negative.\nIf you would like to try again with a negative use `Quality` or `Speed`'})
	}


		
	// --- Balance queue by user
	// -----
	// Reduce queue into arrays of unique users
	let reducedQueueArr = queue.reduce((acc, item) => {
		acc[item.user] = acc[item.user] || [];
		acc[item.user].push(item);
		return acc;
	}, {});

	// Get the maximum array size
	let maxLength = Math.max(...Object.values(reducedQueueArr).map(group => group.length));

	// Balance
	let newQueue = [];
	for (let i = 0; i < maxLength; i++) {
		for (let user of Object.keys(reducedQueueArr)) {
			if (reducedQueueArr[user][i]) {
				newQueue.push(reducedQueueArr[user][i]);
			}
		}
	}
	queue = newQueue;



	// --- Process queue
	// -----

	// If the queue is already being processed, return
	if (processingQueue) {
		return;
	}

	// Set processing boolean
	processingQueue = true;

	// Process queue
	try {
		while (queue.length > 0) {
			
			console.log('\nProcessing queue:')
			for (i = 0; i < queue.length; i++) {
				console.log(`\t${i+1}: ${queue[i].user}, ${queue[i].prompt}`)
			}
			curQueue = queue.shift();
			await run(curQueue.interaction, curQueue.prompt, curQueue.style, curQueue.performance, curQueue.seed, curQueue.negative);
		}
	} catch (error) {
		console.log(error);
	} finally {
		processingQueue = false;
	}
}

module.exports = {
	processQueue,
	data: new SlashCommandBuilder()
		.setName('imagine')
		.setDescription('Generates an image based on your text')
		.addStringOption(option => option.setName('prompt').setDescription('Your prompt for the image to generate').setRequired(true))
		.addStringOption(option => {
			option.setName('style')
				.setDescription('The style of image to generate (1 to 105)')
				.setRequired(false);

			styles.forEach(style => {
				option.addChoices({name: style.name, value: style.name})
			})

			return option;
		})
		.addStringOption(option => option.setName('speed').setDescription('Faster speeds may lessen quality and vice versa').setRequired(false)
			/* Display speed choices with faster options first to encourage users to pick those */
			.addChoices({
				name: 'HyperSD (8x Speed)',
				value: 'HyperSD'
			},{
				name: 'Lightning (4x Speed)',
				value: 'Lightning'
			},{
				name: 'ExtremeSpeed (2x Speed)',
				value: 'ExtremeSpeed'
			},{
				name: 'Speed (1x Speed)',
				value: 'Speed'
			},{
				name: 'Quality (0.5x Speed)',
				value: 'Quality'
			})
		)	
		.addStringOption(option => option.setName('seed').setDescription('The seed to use for the image').setRequired(false))
		.addStringOption(option => option.setName('negative').setDescription('Negative prompt for the image').setRequired(false)),
	async execute(interaction) {
		// --- Validation
		// -----

		// >256 characters will crash
		if (interaction.options.getString('prompt').length > 256){
			await interaction.reply("Prompt must be 256 characters or less.");
			return
		}


		let prompt = interaction.options.getString('prompt');
		let negative = interaction.options.getString('negative');
		let style = interaction.options.getString('style');
		let speed = interaction.options.getString('speed');
		let cmdSeed = interaction.options.getString('seed');

		let queueEntry ={
			user: interaction.user.username,
			interaction: interaction,
			prompt: prompt,
			negative: negative,
			style: style,
			speed: speed,
			seed: cmdSeed
		}

		processQueue(queueEntry);
		//await run(interaction, prompt, style, speed, cmdSeed, negative);

	},
};
