// ==UserScript==
// @name         W3C Spec Quiz
// @namespace    http://tampermonkey.net/
// @version      0.0.1
// @description  Retro 8-bit NES style spec quiz game dynamic for any W3C Technical Report page with dynamic spec parser, score screen confirmation, and chiptune sound engine.
// @author       Kazumasa Okabe (kzms2)
// @match        https://www.w3.org/TR/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // CONFIGURATION / EASY CUSTOMIZATION
    // =========================================================================
    const SECONDS_PER_QUESTION = 10;
    const PANIC_TIME_THRESHOLD = 5;

    // -------------------------------------------------------------------------
    // 1. Load Google Retro Font ('Press Start 2P')
    // -------------------------------------------------------------------------
    if (!document.querySelector('link[href*="Press+Start+2P"]')) {
        const fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
        document.head.appendChild(fontLink);
    }

    // -------------------------------------------------------------------------
    // 2. Web Audio API 8-Bit Chiptune Sound Engine
    // -------------------------------------------------------------------------
    class RetroAudioEngine {
        constructor() {
            this.ctx = null;
            this.bgmTimer = null;
            this.isMuted = false;
        }

        init() {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioCtx();
            }
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }

        playTone(freq, type, duration, gainVal = 0.1) {
            if (this.isMuted || !this.ctx) return;
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + duration);
            } catch (e) {}
        }

        playNoise(duration, gainVal = 0.1) {
            if (this.isMuted || !this.ctx) return;
            try {
                const bufferSize = this.ctx.sampleRate * duration;
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = Math.random() * 2 - 1;
                }
                const noise = this.ctx.createBufferSource();
                noise.buffer = buffer;
                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
                noise.connect(gain);
                gain.connect(this.ctx.destination);
                noise.start();
            } catch (e) {}
        }

        sfxClick() { this.playTone(800, 'square', 0.05, 0.08); }
        sfxCorrect() {
            if (this.isMuted) return;
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
                setTimeout(() => this.playTone(freq, 'square', 0.12, 0.12), idx * 80);
            });
        }
        sfxWrong() {
            if (this.isMuted) return;
            this.playNoise(0.2, 0.2);
            this.playTone(140, 'sawtooth', 0.2, 0.2);
        }
        sfxTick() { this.playTone(1200, 'square', 0.03, 0.05); }
        sfxPanicTick() { this.playTone(1800, 'sawtooth', 0.04, 0.1); }
        sfxVictory() {
            if (this.isMuted) return;
            const melody = [
                { f: 523.25, d: 0.15 }, { f: 659.25, d: 0.15 }, { f: 783.99, d: 0.15 },
                { f: 1046.50, d: 0.30 }, { f: 880.00, d: 0.15 }, { f: 1046.50, d: 0.50 }
            ];
            let delay = 0;
            melody.forEach(item => {
                setTimeout(() => this.playTone(item.f, 'square', item.d, 0.15), delay);
                delay += item.d * 1000 + 50;
            });
        }
        sfxGameOver() {
            if (this.isMuted) return;
            [400, 350, 300, 250, 200, 150].forEach((freq, i) => {
                setTimeout(() => this.playTone(freq, 'sawtooth', 0.2, 0.15), i * 140);
            });
        }

        // 問題入力中のBGM（既存）
        startBGM() {
            if (this.bgmTimer) return;
            const notes = [261.63, 329.63, 392.00, 329.63, 293.66, 349.23, 440.00, 349.23];
            let step = 0;
            this.bgmTimer = setInterval(() => {
                if (!this.isMuted && this.ctx) {
                    this.playTone(notes[step], 'triangle', 0.12, 0.04);
                    step = (step + 1) % notes.length;
                }
            }, 250);
        }

        // タイトル画面用の別の8bitファミコン風BGM
        startTitleBGM() {
            if (this.bgmTimer) return;
            const titleNotes = [440.00, 493.88, 523.25, 587.33, 659.25, 523.25, 392.00, 330.00];
            let step = 0;
            this.bgmTimer = setInterval(() => {
                if (!this.isMuted && this.ctx) {
                    this.playTone(titleNotes[step], 'square', 0.15, 0.03);
                    step = (step + 1) % titleNotes.length;
                }
            }, 200);
        }

        stopBGM() {
            if (this.bgmTimer) {
                clearInterval(this.bgmTimer);
                this.bgmTimer = null;
            }
        }
    }

    const audio = new RetroAudioEngine();

    // -------------------------------------------------------------------------
    // 3. Easy Preset Questions (Fallback / Presentation Demo)
    // -------------------------------------------------------------------------
    const EASY_QUESTIONS = [
        {
            property: "animation-trigger-type",
            context: "Defines whether the animation trigger fires once or continuously on viewport hit.",
            template: "animation-trigger-type: <ANSWER>;",
            answer: "once",
            hint: "Options: once | repeat | alternate",
            detail: "The 'once' value specifies that the animation trigger fires only the first time the target intersects the viewport range, preventing repeated re-triggers during scrolling."
        },
        {
            property: "animation-trigger",
            context: "Shorthand property to set trigger type and trigger scope.",
            template: "animation-trigger: <ANSWER> auto;",
            answer: "none",
            hint: "Default reset value when no trigger applied",
            detail: "The initial value 'none' disables any active animation triggering behavior, serving as a baseline reset for shorthand property declarations."
        },
        {
            property: "animation-trigger-exit-range",
            context: "Defines the exit boundary range for scroll-driven trigger events.",
            template: "animation-trigger-exit-range: <ANSWER>;",
            answer: "normal",
            hint: "Standard keyword representing normal range baseline",
            detail: "The 'normal' keyword specifies the standard boundary range calculations relative to the scroller container's viewport edges."
        },
        {
            property: "animation-trigger-timeline",
            context: "Specifies the timeline used to evaluate trigger state updates.",
            template: "animation-trigger-timeline: <ANSWER>;",
            answer: "auto",
            hint: "Keyword for automatically picking document timeline",
            detail: "The 'auto' keyword allows the user agent to automatically select the nearest appropriate scroll or view timeline context."
        },
        {
            property: "animation-trigger-state",
            context: "Specifies the current activation state of the animation element.",
            template: "animation-trigger-state: <ANSWER>;",
            answer: "active",
            hint: "State when trigger conditions are met",
            detail: "The 'active' state indicates that the target element has successfully met the intersection criteria and the animation is currently running."
        }
    ];

    // -------------------------------------------------------------------------
    // 4. Dynamic Universal W3C Spec Parser (With Normal & Hard Difficulty Logic)
    // -------------------------------------------------------------------------
    function extractSpecQuestions(difficulty) {
        const pool = [];
        const seenAnswers = new Set();

        const propDefTables = document.querySelectorAll('table.def, table.propdef, table.props, table.tbl-value');
        propDefTables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            let currentProp = '';
            rows.forEach(row => {
                const th = row.querySelector('th, td:first-child')?.innerText.trim().toLowerCase() || '';
                const td = row.querySelector('td:last-child')?.innerText.trim() || '';
                if (th.includes('name')) {
                    currentProp = td;
                } else if (th.includes('value') || th.includes('initial') || th.includes('syntax')) {
                    const values = td.split(/\||\|\||\s+/).map(v => v.trim()).filter(v => v.length > 2 && /^[a-zA-Z0-9-]+$/.test(v));
                    values.forEach(val => {
                        if (!['none', 'initial', 'inherit', 'unset'].includes(val.toLowerCase()) && !seenAnswers.has(val.toLowerCase())) {
                            seenAnswers.add(val.toLowerCase());
                            pool.push({
                                property: currentProp || "W3C Spec Definition",
                                context: `Extracted from property definition table (${th}). Complex rendering specification requiring deep standards knowledge.`,
                                template: `${currentProp || 'property'}: <ANSWER>;`,
                                answer: val.toLowerCase(),
                                hint: `Length: ${val.length} chars | Starts with: '${val[0]}'`,
                                detail: `This specification value defines the complex behavior for property '${currentProp || 'property'}'. Consult the W3C Technical Report for detailed syntax rules.`
                            });
                        }
                    });
                }
            });
        });

        const codeElements = Array.from(document.querySelectorAll('pre, code, div.example, dfn'));
        codeElements.forEach(el => {
            const text = el.innerText || "";
            const cssMatches = [...text.matchAll(/([a-z0-9-]{3,30})\s*:\s*([a-z0-9-#]{3,25})/gi)];
            cssMatches.forEach(match => {
                const prop = match[1].trim();
                const val = match[2].trim().toLowerCase();
                if (!['none', 'initial', 'inherit', 'auto', 'normal', 'solid', 'bold', '0', '100%'].includes(val) && !seenAnswers.has(val)) {
                    seenAnswers.add(val);
                    pool.push({
                        property: prop,
                        context: "Extracted from specification code snippet or complex architectural example block.",
                        template: `${prop}: <ANSWER>;`,
                        answer: val,
                        hint: `Length: ${val.length} chars | First char: '${val[0]}'`,
                        detail: `In specification examples, '${prop}' accepts '${val}' to govern complex layout, computed values, and rendering behaviors according to W3C standards.`
                    });
                }
            });
        });

        if (pool.length < 5) {
            const dts = document.querySelectorAll('dt, dfn.dfn-paneled, h3, h4');
            dts.forEach(dt => {
                const term = dt.innerText.trim();
                const dd = dt.nextElementSibling;
                if (term.length >= 3 && term.length <= 30 && /^[a-zA-Z0-9-]+$/.test(term) && !seenAnswers.has(term.toLowerCase())) {
                    seenAnswers.add(term.toLowerCase());
                    pool.push({
                        property: "Spec Keyword Definition",
                        context: dd ? dd.innerText.slice(0, 120) + '...' : "Advanced W3C Specification architectural term",
                        template: `Defined Term: <ANSWER>`,
                        answer: term.toLowerCase(),
                        hint: `Term length: ${term.length} characters`,
                        detail: `This advanced term is formally defined in the W3C specification document to establish precise and complex web platform semantics.`
                    });
                }
            });
        }

        let finalPool = pool.length >= 5 ? pool : [...pool, ...EASY_QUESTIONS];

        // Hardモードの場合：「回答の文字数が多い」「説明や内容が複雑なもの」を優先的に上位にソート・選別する
        if (difficulty === 'hard') {
            finalPool.sort((a, b) => {
                const complexityScoreA = a.answer.length + (a.context.length > 80 ? 20 : 0);
                const complexityScoreB = b.answer.length + (b.context.length > 80 ? 20 : 0);
                return complexityScoreB - complexityScoreA;
            });
        } else {
            // Normalモード等のランダムシャッフル
            for (let i = finalPool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [finalPool[i], finalPool[j]] = [finalPool[j], finalPool[i]];
            }
        }

        return finalPool.slice(0, 5);
    }

    // -------------------------------------------------------------------------
    // 5. Inject Retro NES Stylesheet
    // -------------------------------------------------------------------------
    const styleTag = document.createElement('style');
    styleTag.textContent = `
        :root {
            --nes-bg: #0f0f1b;
            --nes-card: #1b1b2f;
            --nes-border: #f8e71c;
            --nes-text: #ffffff;
            --nes-accent: #00ffcc;
            --nes-danger: #ff0055;
            --nes-success: #00ff66;
        }

        #spec-quest-trigger-btn {
            position: fixed;
            right: 0;
            top: 50%;
            transform: translateY(-50%);
            z-index: 999998;
            background: #ff0055;
            color: #fff;
            font-family: 'Press Start 2P', monospace;
            font-size: 11px;
            padding: 14px 10px;
            border: 4px solid #fff;
            border-right: none;
            cursor: pointer;
            box-shadow: -4px 4px 0px #000;
            writing-mode: vertical-rl;
            text-orientation: upright;
            letter-spacing: 2px;
            transition: all 0.1s ease;
            animation: sqPulse 1.5s infinite alternate;
        }

        #spec-quest-trigger-btn:hover {
            background: #00ffcc;
            color: #000;
            transform: translateY(-50%) scale(1.05);
        }

        @keyframes sqPulse {
            0% { box-shadow: -4px 4px 0px #000, 0 0 5px #ff0055; }
            100% { box-shadow: -6px 6px 0px #000, 0 0 20px #ff0055; }
        }

        #spec-quest-modal {
            position: fixed;
            inset: 0;
            z-index: 999999;
            background: rgba(10, 10, 18, 0.94);
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Press Start 2P', monospace;
            color: var(--nes-text);
            overflow: hidden;
            box-sizing: border-box;
        }

        #spec-quest-modal::before {
            content: " ";
            position: absolute;
            inset: 0;
            background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.3) 50%);
            background-size: 100% 4px;
            pointer-events: none;
            z-index: 10;
        }

        .sq-window {
            position: relative;
            z-index: 11;
            width: 90%;
            max-width: 680px;
            background: var(--nes-card);
            border: 6px solid #ffffff;
            box-shadow: 8px 8px 0px #000000, inset 0 0 0 4px #000;
            padding: 24px;
            text-align: center;
            box-sizing: border-box;
            transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .sq-window.sq-zoom { transform: scale(1.03); }
        .sq-window.sq-shake { animation: sqShakeAnim 0.35s ease-in-out; }

        @keyframes sqShakeAnim {
            0%, 100% { transform: translate(0, 0); }
            20% { transform: translate(-12px, 8px); }
            40% { transform: translate(12px, -8px); }
            60% { transform: translate(-8px, -4px); }
            80% { transform: translate(8px, 4px); }
        }

        #spec-quest-modal.sq-panic .sq-window {
            border-color: var(--nes-danger) !important;
            animation: sqPanicBlink 0.4s infinite alternate;
        }

        @keyframes sqPanicBlink {
            0% { box-shadow: 8px 8px 0px #000, 0 0 15px var(--nes-danger); }
            100% { box-shadow: 8px 8px 0px #000, 0 0 35px var(--nes-danger); }
        }

        .sq-title {
            font-size: 18px;
            color: var(--nes-border);
            text-shadow: 3px 3px 0px #000;
            margin-bottom: 16px;
            line-height: 1.4;
        }

        .sq-subtitle {
            font-size: 10px;
            color: var(--nes-accent);
            margin-bottom: 24px;
            line-height: 1.6;
        }

        .sq-btn {
            font-family: 'Press Start 2P', monospace;
            font-size: 11px;
            padding: 12px 20px;
            margin: 8px;
            background: #2d2d44;
            color: #fff;
            border: 4px solid #fff;
            box-shadow: 4px 4px 0px #000;
            cursor: pointer;
            outline: none;
            transition: all 0.1s;
            display: inline-block;
        }

        .sq-btn:hover {
            background: var(--nes-border);
            color: #000;
            transform: translate(-2px, -2px);
            box-shadow: 6px 6px 0px #000;
        }

        .sq-btn:active {
            transform: translate(2px, 2px);
            box-shadow: 2px 2px 0px #000;
        }

        .sq-btn-danger { background: var(--nes-danger); }
        .sq-btn-success { background: var(--nes-success); color: #000; }

        .sq-code-box {
            background: #000000;
            border: 4px solid var(--nes-accent);
            padding: 16px;
            margin: 16px 0;
            font-size: 13px;
            color: #00ff66;
            text-align: left;
            overflow-x: auto;
            box-shadow: inset 2px 2px 0 #222;
            line-height: 1.6;
        }

        .sq-answer-reveal-box {
            background: #000000;
            border: 4px solid var(--nes-danger);
            padding: 16px;
            margin: 20px 0;
            font-size: 10px;
            color: #ffffff;
            text-align: left;
            box-shadow: inset 2px 2px 0 #222, 0 0 15px rgba(255, 0, 85, 0.4);
            line-height: 1.8;
            min-height: 80px;
            max-height: 160px;
            overflow-y: auto;
        }

        .sq-success-detail-box {
            background: #000000;
            border: 4px solid var(--nes-success);
            padding: 14px;
            margin: 16px 0;
            font-size: 10px;
            color: #ffffff;
            text-align: left;
            box-shadow: inset 2px 2px 0 #222;
            line-height: 1.8;
            min-height: 70px;
            max-height: 150px;
            overflow-y: auto;
        }

        .sq-input-group {
            margin-top: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: center;
        }

        .sq-input {
            width: 80%;
            font-family: 'Press Start 2P', monospace;
            font-size: 13px;
            padding: 12px;
            background: #000;
            color: var(--nes-border);
            border: 4px solid #fff;
            box-shadow: 4px 4px 0px #000;
            text-align: center;
            outline: none;
            caret-color: var(--nes-accent);
        }

        .sq-input:focus {
            border-color: var(--nes-accent);
            box-shadow: 4px 4px 0px #000, 0 0 10px var(--nes-accent);
        }

        .sq-input.sq-error {
            border-color: var(--nes-danger) !important;
            box-shadow: 4px 4px 0px #000, 0 0 12px var(--nes-danger) !important;
        }

        .sq-feedback-msg {
            min-height: 16px;
            font-size: 10px;
            margin-top: 6px;
            color: var(--nes-danger);
            animation: sqBlink 0.3s infinite alternate;
        }

        @keyframes sqBlink {
            0% { opacity: 0.5; }
            100% { opacity: 1; }
        }

        .sq-hud {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
            padding-bottom: 12px;
            border-bottom: 2px dashed #444;
            margin-bottom: 16px;
        }

        .sq-timer-bar {
            width: 100%;
            height: 12px;
            background: #222;
            border: 2px solid #fff;
            margin: 10px 0;
            overflow: hidden;
        }

        .sq-timer-fill {
            height: 100%;
            width: 100%;
            background: var(--nes-success);
            transition: width 1s linear, background-color 0.3s;
        }

        .sq-particle {
            position: absolute;
            width: 8px;
            height: 8px;
            pointer-events: none;
            z-index: 20;
        }

        .sq-stage-banner {
            font-size: 22px;
            color: var(--nes-border);
            animation: sqBlinkBanner 0.2s infinite alternate;
        }

        @keyframes sqBlinkBanner {
            0% { opacity: 0.3; }
            100% { opacity: 1; }
        }
    `;
    document.head.appendChild(styleTag);

    // -------------------------------------------------------------------------
    // 6. Main Game Controller
    // -------------------------------------------------------------------------
    class SpecQuizGame {
        constructor() {
            this.difficulty = 'easy';
            this.questions = [];
            this.currentIndex = 0;
            this.score = 0;
            this.timeLeft = SECONDS_PER_QUESTION;
            this.timerId = null;
            this.modalEl = null;
            this.windowEl = null;
            this.isPanicking = false;
            this.hasGuessedWrong = false;
        }

        getHighScoreKey() {
            return 'sq_highscore_' + window.location.pathname;
        }

        getHighScore() {
            try {
                return parseInt(localStorage.getItem(this.getHighScoreKey()) || '0', 10);
            } catch (e) {
                return 0;
            }
        }

        saveHighScore(newScore) {
            try {
                const current = this.getHighScore();
                if (newScore > current) {
                    localStorage.setItem(this.getHighScoreKey(), newScore.toString());
                    return true;
                }
            } catch (e) {}
            return false;
        }

        openModal() {
            if (this.modalEl) return;
            audio.init();
            audio.sfxClick();

            this.modalEl = document.createElement('div');
            this.modalEl.id = 'spec-quest-modal';

            this.windowEl = document.createElement('div');
            this.windowEl.className = 'sq-window';
            this.modalEl.appendChild(this.windowEl);

            document.body.appendChild(this.modalEl);
            this.showTitleScreen();
        }

        closeModal() {
            this.stopTimer();
            audio.stopBGM();
            if (this.modalEl) {
                this.modalEl.remove();
                this.modalEl = null;
                this.windowEl = null;
            }
        }

        // --- SCREEN 1: Title Screen & Mode Selection ---
        showTitleScreen() {
            audio.stopBGM();
            audio.startTitleBGM(); // タイトル画面専用のBGMを再生
            if (this.modalEl) this.modalEl.classList.remove('sq-panic');

            const highScore = this.getHighScore();

            this.windowEl.innerHTML = `
                <div class="sq-title">SPEC QUEST</div>
                <div class="sq-subtitle">W3C SPECIFICATION QUIZ GAME</div>
                <div style="font-size: 10px; color: var(--nes-border); margin-bottom: 16px; text-shadow: 2px 2px 0px #000;">
                    HIGH SCORE: ${highScore} PTS
                </div>
                <p style="font-size: 9px; line-height: 1.8; color: #aaa; margin-bottom: 24px;">
                    DYNAMICALLY GENERATED FROM CURRENT W3C PAGE.<br>
                    ANSWER BEFORE THE 15-SECOND TIMER EXPIRES!
                </p>
                <div>
                    <button class="sq-btn" id="sq-diff-easy">EASY</button>
                    <button class="sq-btn" id="sq-diff-normal">NORMAL</button>
                    <button class="sq-btn" id="sq-diff-hard">HARD</button>
                </div>
                <div style="margin-top: 20px;">
                    <button class="sq-btn sq-btn-danger" id="sq-exit-btn">QUIT</button>
                </div>
            `;

            document.getElementById('sq-diff-easy').onclick = () => this.startGame('easy');
            document.getElementById('sq-diff-normal').onclick = () => this.startGame('normal');
            document.getElementById('sq-diff-hard').onclick = () => this.startGame('hard');
            document.getElementById('sq-exit-btn').onclick = () => this.closeModal();
        }

        // --- START GAME ---
        startGame(diff) {
            audio.sfxClick();
            audio.stopBGM();
            audio.startBGM(); // クイズ中は通常BGMに切り替え
            this.difficulty = diff;
            this.currentIndex = 0;
            this.score = 0;

            const isTargetURL = window.location.href.includes('WD-animation-triggers-1-20261020') || window.location.pathname.endsWith('demo.html') || window.location.protocol === 'file:';

            if (diff === 'easy' && isTargetURL) {
                // 指定されたURLのときのみEasyの固定問題を使用
                this.questions = [...EASY_QUESTIONS];
            } else {
                // その他の仕様書ページ、あるいはNormal/Hardの場合は動的パース（Hardは難易度ロジック適用）
                this.questions = extractSpecQuestions(diff);
            }

            this.showStageBanner(`STAGE 1`);
        }

        showStageBanner(text) {
            if (this.modalEl) this.modalEl.classList.remove('sq-panic');
            this.windowEl.innerHTML = `
                <div style="padding: 40px 0;">
                    <div class="sq-stage-banner">${text}</div>
                    <div style="font-size: 10px; margin-top: 20px; color: var(--nes-accent);">GET READY...</div>
                </div>
            `;
            setTimeout(() => {
                this.loadQuestion();
            }, 1200);
        }

        // --- SCREEN 2: Active Question Screen ---
        loadQuestion() {
            if (this.currentIndex >= this.questions.length) {
                this.showVictoryScreen();
                return;
            }

            const q = this.questions[this.currentIndex];
            this.timeLeft = SECONDS_PER_QUESTION;
            this.isPanicking = false;
            this.hasGuessedWrong = false; // 問題ごとにリセット
            if (this.modalEl) this.modalEl.classList.remove('sq-panic');

            const formattedTemplate = q.template.replace('<ANSWER>', `<span style="color: var(--nes-border); text-decoration: underline;">????</span>`);

            this.windowEl.innerHTML = `
                <div class="sq-hud">
                    <span>STAGE ${this.currentIndex + 1}/${this.questions.length}</span>
                    <span>SCORE: ${this.score}</span>
                    <span>MODE: ${this.difficulty.toUpperCase()}</span>
                </div>

                <div style="font-size: 10px; color: var(--nes-accent); text-align: left; margin-bottom: 6px;">
                    PROP / TERM: ${q.property}
                </div>

                <div style="font-size: 9px; color: #ccc; text-align: left; margin-bottom: 12px; line-height: 1.5;">
                    CONTEXT: ${q.context}
                </div>

                <div class="sq-code-box">
                    ${formattedTemplate}
                </div>

                <div class="sq-timer-bar">
                    <div id="sq-timer-fill" class="sq-timer-fill"></div>
                </div>
                <div id="sq-timer-text" style="font-size: 10px; text-align: right; color: var(--nes-text);">
                    TIME: ${this.timeLeft}s
                </div>

                <form id="sq-answer-form" class="sq-input-group" autocomplete="off">
                    <!-- ヒントを入力欄のすぐ上に目立つように配置 -->
                    <div id="sq-hint-container" style="font-size: 10px; color: #f1c40f; text-align: center; display: none; background: #222; border: 2px dashed #f8e71c; padding: 6px; width: 80%; box-sizing: border-box;">
                        💡 HINT: ${q.hint}
                    </div>
                    <input type="text" id="sq-user-input" class="sq-input" placeholder="TYPE VALUE..." autofocus />
                    <div id="sq-feedback" class="sq-feedback-msg"></div>
                    <button type="submit" class="sq-btn" style="width: 80%;">SUBMIT ANSWER</button>
                </form>
            `;

            const inputEl = document.getElementById('sq-user-input');
            inputEl.focus();

            inputEl.addEventListener('focus', () => {
                this.windowEl.classList.add('sq-zoom');
            });
            inputEl.addEventListener('blur', () => {
                this.windowEl.classList.remove('sq-zoom');
            });

            document.getElementById('sq-answer-form').onsubmit = (e) => {
                e.preventDefault();
                this.checkAnswer(inputEl.value.trim());
            };

            this.startTimer();
        }

        // --- TIMER CONTROLLER ---
        startTimer() {
            this.stopTimer();

            this.timerId = setInterval(() => {
                this.timeLeft--;
                const fillEl = document.getElementById('sq-timer-fill');
                const textEl = document.getElementById('sq-timer-text');

                if (fillEl && textEl) {
                    const pct = (this.timeLeft / SECONDS_PER_QUESTION) * 100;
                    fillEl.style.width = `${pct}%`;
                    textEl.innerText = `TIME: ${this.timeLeft}s`;

                    if (this.timeLeft <= PANIC_TIME_THRESHOLD) {
                        if (!this.isPanicking) {
                            this.isPanicking = true;
                            if (this.modalEl) this.modalEl.classList.add('sq-panic');
                        }
                        fillEl.style.backgroundColor = 'var(--nes-danger)';
                        audio.sfxPanicTick();
                    } else {
                        audio.sfxTick();
                    }
                }

                if (this.timeLeft <= 0) {
                    this.stopTimer();
                    this.handleTimeout();
                }
            }, 1000);
        }

        stopTimer() {
            if (this.timerId) {
                clearInterval(this.timerId);
                this.timerId = null;
            }
        }

        // --- ANSWER CHECKING ---
        checkAnswer(userAns) {
            const currentQ = this.questions[this.currentIndex];
            const isCorrect = userAns.toLowerCase() === currentQ.answer.toLowerCase();

            if (isCorrect) {
                this.stopTimer();
                audio.sfxCorrect();
                this.score += 100 + this.timeLeft * 10;
                this.spawnParticles();

                // ピンチ状態（赤枠点滅）の解除
                if (this.modalEl) this.modalEl.classList.remove('sq-panic');

                // 正解時の詳細説明（Easy問題含む全問題に適用、min-heightとスクロール対応のボックス）
                this.windowEl.innerHTML = `
                    <div style="padding: 10px 0;">
                        <div style="font-size: 16px; color: var(--nes-success); margin-bottom: 12px;">
                            CORRECT!
                        </div>
                        <div style="font-size: 10px; color: #fff; margin-bottom: 10px; text-align: left;">
                            YOUR INPUT: <span style="color: var(--nes-border);">${userAns}</span>
                        </div>
                        <div class="sq-success-detail-box">
                            <strong style="color: var(--nes-success);">SPECIFICATION DETAIL:</strong><br><br>
                            ${currentQ.detail || currentQ.context}
                        </div>
                        <div style="font-size: 9px; color: var(--nes-accent); margin-top: 10px;">
                            +${100 + this.timeLeft * 10} PTS | NEXT STAGE COMING...
                        </div>
                    </div>
                `;

                setTimeout(() => {
                    this.currentIndex++;
                    if (this.currentIndex < this.questions.length) {
                        this.showStageBanner(`STAGE ${this.currentIndex + 1}`);
                    } else {
                        this.showVictoryScreen();
                    }
                }, 3500);

            } else {
                audio.sfxWrong();
                this.windowEl.classList.add('sq-shake');
                setTimeout(() => this.windowEl.classList.remove('sq-shake'), 350);

                // 一度間違えたら入力欄のすぐ上のヒントを表示する
                if (!this.hasGuessedWrong) {
                    this.hasGuessedWrong = true;
                    const hintEl = document.getElementById('sq-hint-container');
                    if (hintEl) hintEl.style.display = 'block';
                }

                const inputEl = document.getElementById('sq-user-input');
                const feedbackEl = document.getElementById('sq-feedback');

                if (inputEl) {
                    inputEl.value = '';
                    inputEl.classList.add('sq-error');
                    setTimeout(() => inputEl.classList.remove('sq-error'), 400);
                    inputEl.focus();
                }

                if (feedbackEl) {
                    feedbackEl.innerText = `WRONG! TRY AGAIN!`;
                    setTimeout(() => {
                        if (feedbackEl) feedbackEl.innerText = '';
                    }, 1200);
                }
            }
        }

        // --- TIMEOUT / FAIL REVEAL SCREEN ---
        handleTimeout() {
            audio.stopBGM();
            audio.sfxWrong();
            if (this.modalEl) this.modalEl.classList.remove('sq-panic'); // ピンチ状態の枠色を元に戻す
            this.windowEl.classList.add('sq-shake');
            setTimeout(() => this.windowEl.classList.remove('sq-shake'), 400);

            const currentQ = this.questions[this.currentIndex];

            this.windowEl.innerHTML = `
                <div style="font-size: 16px; color: var(--nes-danger); margin-bottom: 10px;">
                    TIME UP!
                </div>
                <div style="font-size: 9px; color: #aaa; margin-bottom: 10px;">
                    YOU COULD NOT COMPLETE THE SPECIFICATION IN TIME.
                </div>

                <div class="sq-answer-reveal-box">
                    <div style="color: var(--nes-border); font-size: 10px; margin-bottom: 6px;">THE CORRECT ANSWER WAS: <span style="color: var(--nes-success);">${currentQ.answer}</span></div>
                    <div style="color: #ccc; font-size: 9px; margin-top: 6px; border-top: 1px dashed #444; padding-top: 6px;">
                        <strong style="color: var(--nes-accent);">SPECIFICATION DETAIL:</strong><br>
                        ${currentQ.detail || currentQ.context}
                    </div>
                </div>

                <div>
                    <button class="sq-btn sq-btn-success" id="sq-confirm-fail-btn">[ VIEW RESULTS ]</button>
                </div>
            `;

            document.getElementById('sq-confirm-fail-btn').onclick = () => {
                audio.sfxClick();
                this.showGameOverScreen("OUT OF TIME");
            };
        }

        // --- SCREEN 3: Game Over Summary ---
        showGameOverScreen(reason) {
            audio.sfxGameOver();
            if (this.modalEl) this.modalEl.classList.remove('sq-panic');

            const isNewHigh = this.saveHighScore(this.score);
            const highScore = this.getHighScore();

            this.windowEl.innerHTML = `
                <div class="sq-title" style="color: var(--nes-danger);">GAME OVER</div>
                <div style="font-size: 10px; color: #aaa; margin-bottom: 12px;">REASON: ${reason}</div>
                <div style="font-size: 12px; margin-bottom: 8px;">FINAL SCORE: ${this.score}</div>
                <div style="font-size: 10px; color: var(--nes-border); margin-bottom: 24px;">
                    ${isNewHigh ? "🎉 NEW HIGH SCORE! 🎉" : `HIGH SCORE: ${highScore}`}
                </div>

                <div>
                    <button class="sq-btn" id="sq-retry-btn">RETRY</button>
                    <button class="sq-btn" id="sq-title-btn">TITLE SCREEN</button>
                </div>
            `;

            document.getElementById('sq-retry-btn').onclick = () => this.startGame(this.difficulty);
            document.getElementById('sq-title-btn').onclick = () => this.showTitleScreen();
        }

        // --- SCREEN 4: Victory Summary ---
        showVictoryScreen() {
            audio.stopBGM();
            audio.sfxVictory();
            this.spawnParticles();
            if (this.modalEl) this.modalEl.classList.remove('sq-panic');

            const isNewHigh = this.saveHighScore(this.score);
            const highScore = this.getHighScore();

            this.windowEl.innerHTML = `
                <div class="sq-title" style="color: var(--nes-success);">QUEST COMPLETE!</div>
                <div class="sq-subtitle">YOU ARE A W3C SPEC MASTER!</div>

                <div style="font-size: 11px; line-height: 2; margin-bottom: 8px;">
                    STAGES CLEARED: ${this.questions.length}/${this.questions.length}<br>
                    FINAL SCORE: <span style="color: var(--nes-border);">${this.score}</span>
                </div>
                <div style="font-size: 10px; color: var(--nes-border); margin-bottom: 24px;">
                    ${isNewHigh ? "🎉 NEW HIGH SCORE! 🎉" : `HIGH SCORE: ${highScore}`}
                </div>

                <div>
                    <button class="sq-btn" id="sq-play-again-btn">PLAY AGAIN</button>
                    <button class="sq-btn" id="sq-vic-title-btn">TITLE SCREEN</button>
                </div>
            `;

            document.getElementById('sq-play-again-btn').onclick = () => this.startGame(this.difficulty);
            document.getElementById('sq-vic-title-btn').onclick = () => this.showTitleScreen();
        }

        // --- RETRO PARTICLE FX ---
        spawnParticles() {
            const colors = ['#f8e71c', '#00ffcc', '#ff0055', '#00ff66', '#ffffff'];
            const count = 30;

            for (let i = 0; i < count; i++) {
                const particle = document.createElement('div');
                particle.className = 'sq-particle';
                particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

                const startX = window.innerWidth / 2;
                const startY = window.innerHeight / 2;
                particle.style.left = `${startX}px`;
                particle.style.top = `${startY}px`;

                this.modalEl.appendChild(particle);

                const angle = Math.random() * Math.PI * 2;
                const speed = 50 + Math.random() * 150;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;

                let opacity = 1;
                const anim = setInterval(() => {
                    const currentLeft = parseFloat(particle.style.left);
                    const currentTop = parseFloat(particle.style.top);
                    particle.style.left = `${currentLeft + vx * 0.05}px`;
                    particle.style.top = `${currentTop + vy * 0.05}px`;
                    opacity -= 0.03;
                    particle.style.opacity = opacity;

                    if (opacity <= 0) {
                        clearInterval(anim);
                        particle.remove();
                    }
                }, 30);
            }
        }
    }

    // -------------------------------------------------------------------------
    // 7. Trigger Button Initialization
    // -------------------------------------------------------------------------
    function initLauncher() {
        const game = new SpecQuizGame();

        const triggerBtn = document.createElement('button');
        triggerBtn.id = 'spec-quest-trigger-btn';
        triggerBtn.innerHTML = `QUIZ START`;
        triggerBtn.title = "Start W3C 8-Bit Spec Quiz Game";

        triggerBtn.onclick = () => {
            game.openModal();
        };

        document.body.appendChild(triggerBtn);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initLauncher();
    } else {
        window.addEventListener('DOMContentLoaded', initLauncher);
    }
})();