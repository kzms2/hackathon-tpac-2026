# W3C Spec Quiz Userscript

An 8-bit retro NES-style quiz game that dynamically extracts quizzes from any W3C specification document.

## Setup & Installation

### Prerequisites
- Google Chrome, Mozilla Firefox, Microsoft Edge, or Apple Safari.
- [Tampermonkey extension](https://www.tampermonkey.net/) installed in your browser.

### Quick Demo

[Quick Demo](easy-demo.html) - Try an interactive demo in your browser.

### Installation Steps

1. **Install Tampermonkey**: If you haven't already, install the Tampermonkey browser extension from the official web store or website.
2. **Open Dashboard**: Click on the Tampermonkey icon in your browser toolbar and select **Create a new script...**.
3. **Load the Script**:
   - Open [w3c-spec-quiz.user.js](w3c-spec-quiz.user.js) (located in the same directory as this README).
   - Copy the entire script content into the Tampermonkey editor window.
4. **Save**: Press `Ctrl + S` (or `Cmd + S` on Mac) to save the script.

## How to Play

1. Visit any W3C Technical Report page (e.g., `https://www.w3.org/TR/*`).
2. Click the red **QUIZ START** button on the right edge of your screen.
3. Select your difficulty (**EASY**, **NORMAL**, or **HARD**).
4. Type the missing specification property or keyword values within 10 seconds!