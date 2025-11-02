import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export interface Card {
	question: string;
	category: string;
	categoryCount: number;
	color: string[];
}

function normalizeColor(raw?: string | null): string[] {
	if (!raw) return [];
	const s = raw.trim().toLowerCase();
	// unknown color: return capitalized token
	const token = s.split(/\s+/);
	return token;
}

/**
 * Parse a markdown file which uses nested `-` lists to represent:
 * - Category
 *   - Question
 *     - Color (optional)
 */
export function parseQuestions(markdown: string): Card[] {
	const cards: Card[] = [];
	const lines = markdown.split(/\r?\n/);

	let currentCategory: string | null = null;
	let lastCard: Card | null = null;

	for (let rawLine of lines) {
		const line = rawLine.replace(/\t/g, '    ');
		const trimmed = line.trim();
		if (!trimmed) continue;
		// skip markdown fence markers
		if (trimmed.startsWith('```')) continue;

		// match a list item: capture leading spaces, then '-' or '*', then content
		const m = line.match(/^(\s*)[-*]\s+(.*)$/);
		if (!m) continue;

		const indent = m[1].length;
		const content = m[2].trim();

		if (indent === 0) {
			// top-level category
			currentCategory = content;
			lastCard = null;
			continue;
		}

		if (indent <= 2) {
			// treat as question under current category
			if (!currentCategory) currentCategory = 'Uncategorized';
			// remove the optional (\d×) suffix from category and store the count separately
			const normalizedCategory = currentCategory.replace(/\s*\(\d+×\)$/, '').trim().toLowerCase();
			const categoryCount = (() => {
				const m = currentCategory.match(/\((\d+)×\)$/);
				return m ? parseInt(m[1], 10) : 1;
			})();
			const normelizedQuestion = content.replaceAll('\\n', '<br>');
			const card: Card = { question: normelizedQuestion, category: normalizedCategory, categoryCount: categoryCount, color: [] };
			cards.push(card);
			lastCard = card;
			continue;
		}

		// indent >= 3 -> likely a sub-list under the last question (e.g. color)
		// If the content looks like a color token, assign it to lastCard.color
		if (lastCard) {
			const maybeColor = content.split(/\s+/)[0];
			// simple heuristic: short single token and alphabetical
			if (/^[A-Za-z]+$/.test(maybeColor) && maybeColor.length <= 12) {
				const color = normalizeColor(maybeColor);
				if (color)
					lastCard.color.push(...color);
				continue;
			}
			// otherwise, append as extra text to question (rare)
			// We choose to append it in parentheses.
			lastCard.question = `${lastCard.question} (${content})`;
		}
	}

	return cards;
}

function createHTMLCards(cards: Card[]): string {
	const page_width_mm = 210;
	const page_height_mm = 297;
	const card_width_mm = 90;
	const card_height_mm = 55;
	const border_mm = 5;
	const bleed_mm = 2;

	const number_of_players = 6;
	const cards_per_player = (Object.values(cards.reduce((previous, current) => {
		return {
			...previous,
			[current.category]: current.categoryCount
		};
	}, {} as Record<string, number>)).reduce((a, b) => a + b, 0));


	const card_width_total_mm = card_width_mm + 2 * bleed_mm;
	const card_height_total_mm = card_height_mm + 2 * bleed_mm;

	const page_border_mm = 5;

	const cards_per_row = Math.floor((page_width_mm - 2 * page_border_mm) / card_width_total_mm);
	const cards_per_column = Math.floor((page_height_mm - 2 * page_border_mm) / card_height_total_mm);
	const cards_per_page = cards_per_row * cards_per_column;

	// add blank cards for the players
	for (let i = 0; i < number_of_players * cards_per_player; i++) {
		cards.push({
			question: ``,
			category: '',
			categoryCount: 1,
			color: []
		});
	}
	// fill up to multiple of cards_per_page
	while (cards.length % cards_per_page !== 0) {
		cards.push({
			question: ``,
			category: '',
			categoryCount: 1,
			color: []
		});
	}


	const color_mapping: {
		[key: string]: string | undefined;
	} = {
		'magenta': '#fd00ff',
		'indigo': '#8900ff',
		'green': '#00ff94',
	}



	let html = `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Cards</title>
	<style>
		body { font-family: Arial, sans-serif; background-color: #555;
			margin: 0; 
			padding: 10mm; 
			display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            align-items: center;
			justify-content: center;
			gap: 10mm;
			z-index: -30;
			
			@media print {
				gap: 0;
				padding: 0;
				margin: 0;
			}
		}
		.page {
			background-color: white;
			page-break-after: always;
			width: ${page_width_mm}mm;
			height: ${page_height_mm}mm;
			display: grid;
			grid-template-columns: repeat(${cards_per_row}, ${card_width_total_mm}mm);
			grid-template-rows: repeat(${cards_per_column}, ${card_height_total_mm}mm);
			gap: 0;
			justify-content: center;
			align-content: center;
			z-index: -20;



		}
		.card {
			--card-bg: #dbefe0ff;
			--card-sp: #dbefe0ff;
			--card-bg2: #dbefe0ff;
			width: ${card_width_total_mm}mm;
			height: ${card_height_total_mm}mm;
			box-sizing: border-box;
			background: linear-gradient(105deg, var(--card-bg2) 49%, 49%, var(--card-sp), 51%, var(--card-bg) 51%);
			display: flex;
			justify-content: center;
			align-items: center;
			text-align: center;
			position: relative;


			&.back .horizontal {
				content: " ";
				position: absolute;
				left: ${-(page_width_mm - (card_width_total_mm * cards_per_row)) / 2}mm;
				top: ${bleed_mm}mm;
				height:  ${card_height_total_mm - 2 * bleed_mm}mm;	
				width: ${page_width_mm}mm;
				border-top:  1px dashed black;
				border-bottom: 1px dashed black;
				box-sizing: border-box;
				pointer-events: none;
				z-index: 10;
			}
			&.back .vertical {
				content: " ";
				position: absolute;
				top: ${-(page_height_mm - (card_height_total_mm * cards_per_column)) / 2}mm;
				left: ${bleed_mm}mm;
				width: ${card_width_total_mm - 2 * bleed_mm}mm;	
				height: ${page_height_mm}mm;
				border-left:  1px dashed black;
				border-right: 1px dashed black;
				box-sizing: border-box;
				pointer-events: none;
				z-index: 10;
			}
			&>.content {
				background-color: white;
				height: ${card_height_mm - 2 * border_mm}mm;
				width: ${card_width_mm - 2 * border_mm}mm;
				padding: 5mm;
				box-sizing: border-box;
				border-radius: 3mm;
				// center content
				display: flex;
				justify-content: center;
				align-content: center;
			}
		}
	</style>
</head>
<body>
		`;
	// add a page for front and back
	// front has questions
	// back has svg icons
	// both have the border and bleed areas in the color of the card

	let frontPageContent = '';
	let backPageContent = '';
	for (let pageStart = 0; pageStart < cards.length; pageStart += cards_per_page) {
		const pageCards = cards.slice(pageStart, pageStart + cards_per_page);
		frontPageContent += `<div class="page front">\n`;
		backPageContent += `<div class="page back">\n`;
		for (const card of pageCards) {
			const color1 = color_mapping[card.color[0] ?? ''] ?? card.color[0] ?? null;
			const color2 = color_mapping[card.color[1] ?? ''] ?? card.color[1] ?? null;

			const colorStyle = color1 && color2
				? `--card-bg: ${color1}; --card-bg2: ${color2}; --card-sp: white;`
				: color1
					? `--card-bg: ${color1}; --card-sp: ${color1}; --card-bg2: ${color1};` : '';
			const rowIndex = Math.floor((pageCards.indexOf(card)) / cards_per_row);
			const colIndex = pageCards.indexOf(card) % cards_per_row;
			const gridPositionStyleFront = `grid-row: ${rowIndex + 1}; grid-column: ${colIndex + 1};`;
			const gridPositionStyleBack = `grid-row: ${rowIndex + 1}; grid-column: ${cards_per_row - colIndex};`;
			frontPageContent += `<div class="card front" style="${colorStyle} ${gridPositionStyleFront}"><div class="content"><div>${card.question}</div></div></div>\n`;
			if (card.category != '') {

				backPageContent += `<div class="card back" style="${colorStyle} ${gridPositionStyleBack}"><div class="content"><div><img src="icons/${card.category}.svg" />${(card.categoryCount > 1) ? ` (${card.categoryCount}×)` : ''
					}`;
			} else {
				backPageContent += `<div class="card back" style="${colorStyle} ${gridPositionStyleBack}"><div class="content"><div>`;
			}
			backPageContent += `</div></div>`;
			if (rowIndex === 0) {
				backPageContent += `<div class="vertical"></div>`;
			}
			if (colIndex === cards_per_row - 1) {
				backPageContent += `<div class="horizontal" ></div>`;
			}
			backPageContent += `</div>\n`;
		}
		frontPageContent += `</div>\n`;
		backPageContent += `</div>\n`;

		html += frontPageContent;
		html += backPageContent;
		frontPageContent = '';
		backPageContent = '';

	}

	html += `
</body>
</html>
	`;
	return html;
}




// If this file is executed directly (ESM-compatible), provide a small runner.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
	const mdPath = path.join(__dirname, 'Fragen.md');
	const outPath = path.join(__dirname, 'cards.json');
	const md = fs.readFileSync(mdPath, 'utf8');
	const cards = parseQuestions(md);
	const html = createHTMLCards(cards);
	const htmlOutPath = path.join(__dirname, 'cards.html');
	fs.writeFileSync(htmlOutPath, html, 'utf8');
	console.log(`Wrote HTML output to ${htmlOutPath}`);
	fs.writeFileSync(outPath, JSON.stringify(cards, null, 2), 'utf8');
	console.log(`Wrote ${cards.length} cards to ${outPath}`);
}
