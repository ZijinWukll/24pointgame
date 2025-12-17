(() => {
    "use strict";

    const EPS = 1e-6;
    const TARGET = 24;

    /** @type {number[]} */
    let currentNumbers = [];
    /** @type {string | null} */
    let currentSolution = null;
    /**
     * 按“按钮输入单位”维护的表达式 token 列表。
     * 例如依次点击 1、3 会得到 ["1","3"]；
     * 依次点击 13 会得到 ["13"]，用于删除时的粒度控制。
     * 只通过 appendToken/deleteAtCursor/clear 重建，不接受键盘直接改动。
     * @type {string[]}
     */
    let inputTokens = [];

    function $(id) {
        const el = document.getElementById(id);
        if (!el) throw new Error(`Missing element #${id}`);
        return el;
    }

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function generateNumbers() {
        // 对齐 C++：1~13（扑克牌点数）
        return [randInt(1, 13), randInt(1, 13), randInt(1, 13), randInt(1, 13)];
    }

    function formatExprForUser(expr) {
        // 只是展示友好：* / 替换成 × ÷
        return expr.replaceAll("*", "×").replaceAll("/", "÷");
    }

    /**
     * 24 点求解（前端版）：返回一个可行表达式（用 + - * / 与括号），找不到则返回 null
     * @param {number[]} nums
     */
    function solve24(nums) {
        /** @type {{ v: number, e: string }[]} */
        const items = nums.map((n) => ({ v: n, e: String(n) }));

        function dfs(list) {
            if (list.length === 1) {
                return Math.abs(list[0].v - TARGET) < EPS ? list[0].e : null;
            }

            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    const a = list[i];
                    const b = list[j];
                    /** @type {{ v: number, e: string }[]} */
                    const rest = [];
                    for (let k = 0; k < list.length; k++) {
                        if (k !== i && k !== j) rest.push(list[k]);
                    }

                    /** @type {{ v: number, e: string }[]} */
                    const candidates = [];

                    // 加/乘：交换无意义，只生成一种
                    candidates.push({ v: a.v + b.v, e: `(${a.e}+${b.e})` });
                    candidates.push({ v: a.v * b.v, e: `(${a.e}*${b.e})` });

                    // 减/除：两种方向都要
                    candidates.push({ v: a.v - b.v, e: `(${a.e}-${b.e})` });
                    candidates.push({ v: b.v - a.v, e: `(${b.e}-${a.e})` });

                    if (Math.abs(b.v) > EPS) candidates.push({ v: a.v / b.v, e: `(${a.e}/${b.e})` });
                    if (Math.abs(a.v) > EPS) candidates.push({ v: b.v / a.v, e: `(${b.e}/${a.e})` });

                    for (const c of candidates) {
                        const next = rest.concat([c]);
                        const found = dfs(next);
                        if (found) return found;
                    }
                }
            }
            return null;
        }

        return dfs(items);
    }

    function tokenize(expr) {
        /** @type {{type:'num', value:number} | {type:'op', value:string} | {type:'paren', value:'(' | ')'} }[] */
        const tokens = [];
        let i = 0;
        while (i < expr.length) {
            const ch = expr[i];
            if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
                i++;
                continue;
            }
            if (ch === "(" || ch === ")") {
                tokens.push({ type: "paren", value: ch });
                i++;
                continue;
            }
            if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
                tokens.push({ type: "op", value: ch });
                i++;
                continue;
            }
            if ((ch >= "0" && ch <= "9") || ch === ".") {
                let j = i;
                let dotCount = 0;
                while (j < expr.length) {
                    const c = expr[j];
                    if (c === ".") dotCount++;
                    if (!((c >= "0" && c <= "9") || c === ".")) break;
                    j++;
                }
                if (dotCount > 1) throw new Error("数字格式错误：小数点过多");
                const raw = expr.slice(i, j);
                const value = Number(raw);
                if (!Number.isFinite(value)) throw new Error("数字格式错误");
                tokens.push({ type: "num", value });
                i = j;
                continue;
            }

            throw new Error(`包含不支持的字符：${ch}`);
        }
        return tokens;
    }

    function toRpn(tokens) {
        /** @type {{type:'num', value:number} | {type:'op', value:string} }[] */
        const output = [];
        /** @type {string[]} */
        const ops = [];

        const precedence = (op) => {
            if (op === "NEG") return 3;
            if (op === "*" || op === "/") return 2;
            if (op === "+" || op === "-") return 1;
            return 0;
        };
        const isRightAssoc = (op) => op === "NEG";
        const isOperator = (op) => op === "+" || op === "-" || op === "*" || op === "/" || op === "NEG";

        /** @type {'start'|'num'|'op'|'lparen'|'rparen'} */
        let prev = "start";

        for (let idx = 0; idx < tokens.length; idx++) {
            const t = tokens[idx];
            if (t.type === "num") {
                output.push(t);
                prev = "num";
                continue;
            }
            if (t.type === "paren") {
                if (t.value === "(") {
                    ops.push("(");
                    prev = "lparen";
                } else {
                    while (ops.length && ops[ops.length - 1] !== "(") {
                        output.push({ type: "op", value: ops.pop() });
                    }
                    if (!ops.length) throw new Error("括号不匹配");
                    ops.pop();
                    prev = "rparen";
                }
                continue;
            }
            if (t.type === "op") {
                let op = t.value;
                const isUnary = (prev === "start" || prev === "op" || prev === "lparen") && (op === "+" || op === "-");
                if (isUnary) {
                    if (op === "+") {
                        // 一元 + 直接忽略
                        prev = "op";
                        continue;
                    }
                    // 一元 -
                    op = "NEG";
                }

                if (!isOperator(op)) throw new Error("不支持的运算符");
                while (ops.length) {
                    const top = ops[ops.length - 1];
                    if (top === "(") break;
                    const pTop = precedence(top);
                    const pOp = precedence(op);
                    if (pTop > pOp || (pTop === pOp && !isRightAssoc(op))) {
                        output.push({ type: "op", value: ops.pop() });
                        continue;
                    }
                    break;
                }
                ops.push(op);
                prev = "op";
                continue;
            }
        }

        while (ops.length) {
            const op = ops.pop();
            if (op === "(") throw new Error("括号不匹配");
            output.push({ type: "op", value: op });
        }
        return output;
    }

    function evalRpn(rpn) {
        /** @type {number[]} */
        const stack = [];
        for (const t of rpn) {
            if (t.type === "num") {
                stack.push(t.value);
                continue;
            }
            if (t.type === "op") {
                if (t.value === "NEG") {
                    if (stack.length < 1) throw new Error("表达式不完整");
                    stack.push(-stack.pop());
                    continue;
                }
                if (stack.length < 2) throw new Error("表达式不完整");
                const b = stack.pop();
                const a = stack.pop();
                if (t.value === "+") stack.push(a + b);
                else if (t.value === "-") stack.push(a - b);
                else if (t.value === "*") stack.push(a * b);
                else if (t.value === "/") stack.push(a / b);
                else throw new Error("不支持的运算符");
                continue;
            }
        }
        if (stack.length !== 1) throw new Error("表达式不合法");
        return stack[0];
    }

    function evalExpression(expr) {
        const clean = expr
            .replaceAll("×", "*")
            .replaceAll("÷", "/")
            .replaceAll("−", "-");
        const tokens = tokenize(clean);
        const rpn = toRpn(tokens);
        const value = evalRpn(rpn);
        if (!Number.isFinite(value)) throw new Error("计算结果无效");
        return value;
    }

    function renderNumbers(nums) {
        const numbersArea = $("numbersArea");
        numbersArea.innerHTML = "";
        for (const n of nums) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "num";
            btn.setAttribute("data-num", String(n));
            btn.setAttribute("aria-label", `数字 ${n}`);
            btn.innerHTML = `<div class="num-value">${n}</div>`;
            numbersArea.appendChild(btn);
        }
    }

    function rebuildInputFromTokens() {
        const input = $("exprInput");
        const value = inputTokens.join("");
        input.value = value;
        return value;
    }

    function getTokenBoundaries() {
        /** @type {number[]} */
        const boundaries = [0];
        let pos = 0;
        for (const t of inputTokens) {
            pos += t.length;
            boundaries.push(pos);
        }
        return boundaries;
    }

    function syncInputCaret(caretPos) {
        const input = $("exprInput");
        const value = inputTokens.join("");
        input.value = value;
        const pos = Math.max(0, Math.min(caretPos, value.length));
        try {
            input.setSelectionRange(pos, pos);
            input.focus();
        } catch { }
    }

    function normalizeCaretToBoundary() {
        const input = $("exprInput");
        const value = inputTokens.join("");
        if (input.value !== value) input.value = value;

        const boundaries = getTokenBoundaries();
        if (!boundaries.length) {
            try {
                input.setSelectionRange(0, 0);
            } catch { }
            return 0;
        }

        const raw = input.selectionStart != null ? input.selectionStart : value.length;
        let nearest = boundaries[0];
        let minDist = Math.abs(raw - boundaries[0]);
        for (let i = 1; i < boundaries.length; i++) {
            const b = boundaries[i];
            const d = Math.abs(raw - b);
            if (d < minDist) {
                minDist = d;
                nearest = b;
            }
        }
        try {
            input.setSelectionRange(nearest, nearest);
        } catch { }
        return nearest;
    }

    function appendToken(token) {
        // 根据当前光标位置（自动吸附到 token 边界）在 token 列表中插入一个新的 token
        const input = $("exprInput");
        // 先确保 input 与 token 列表同步
        rebuildInputFromTokens();
        const caretBoundary = normalizeCaretToBoundary();
        const boundaries = getTokenBoundaries();
        let insertIndex = boundaries.indexOf(caretBoundary);
        if (insertIndex === -1) insertIndex = inputTokens.length;

        inputTokens.splice(insertIndex, 0, token);
        const newBoundaries = getTokenBoundaries();
        const newCaret = newBoundaries[insertIndex + 1];
        syncInputCaret(newCaret);
        hideHint();
        setMessage("继续输入，或点击“确定”验证答案", undefined);
    }

    function deleteAtCursor() {
        if (!inputTokens.length) return;

        const input = $("exprInput");
        // 保证 input 与 token 列表同步
        rebuildInputFromTokens();

        // 不考虑选择一段文本的情况：若有选区，先收缩到起点，再按“一个 token”为单位删除
        const rawStart = input.selectionStart != null ? input.selectionStart : input.value.length;
        try {
            input.setSelectionRange(rawStart, rawStart);
        } catch { }

        const caretBoundary = normalizeCaretToBoundary();
        const boundaries = getTokenBoundaries();
        let boundaryIndex = boundaries.indexOf(caretBoundary);
        if (boundaryIndex <= 0) return; // 光标在最前面，没有可删 token

        const removeIndex = boundaryIndex - 1; // 删除光标前面的一个 token
        inputTokens.splice(removeIndex, 1);

        const newBoundaries = getTokenBoundaries();
        const newCaret = newBoundaries[removeIndex];
        syncInputCaret(newCaret);
        hideHint();
        setMessage("已删除一个输入", undefined);
    }

    function setMessage(text, kind) {
        const msg = $("resultMsg");
        msg.textContent = text;
        msg.classList.remove("ok", "bad");
        if (kind === "ok") msg.classList.add("ok");
        if (kind === "bad") msg.classList.add("bad");
    }

    function hideHint() {
        const hintArea = $("hintArea");
        hintArea.hidden = true;
        $("hintExpr").textContent = "";

        const hintBtn = $("hintBtn");
        hintBtn.classList.remove("is-on");
        hintBtn.setAttribute("aria-pressed", "false");
    }

    function showHint() {
        const hintArea = $("hintArea");
        const hintExpr = $("hintExpr");
        if (!currentSolution) {
            hintExpr.textContent = "呃这组数字好像没有解（理论上不该出现）";
            hintArea.hidden = false;
            return;
        }
        hintExpr.textContent = formatExprForUser(currentSolution);
        hintArea.hidden = false;

        const hintBtn = $("hintBtn");
        hintBtn.classList.add("is-on");
        hintBtn.setAttribute("aria-pressed", "true");
    }

    function toggleHint() {
        const hintArea = $("hintArea");
        if (hintArea.hidden) {
            showHint();
            setMessage("已显示一种提示答案（仅供参考）", undefined);
        } else {
            hideHint();
            setMessage("已隐藏提示答案", undefined);
        }
    }

    function newGame() {
        setMessage("正在生成可解题目…", undefined);
        hideHint();
        inputTokens = [];
        syncInputCaret(0);

        let nums;
        let sol = null;
        // 对齐 C++：反复生成，直到有解
        for (let tries = 0; tries < 5000; tries++) {
            nums = generateNumbers();
            sol = solve24(nums);
            if (sol) break;
        }

        if (!sol) {
            // 极小概率（理论上不会）
            currentNumbers = [1, 1, 1, 1];
            currentSolution = null;
            renderNumbers(currentNumbers);
            setMessage("生成失败：请点击“换一组”", "bad");
            return;
        }

        currentNumbers = nums;
        currentSolution = sol;
        renderNumbers(currentNumbers);
        setMessage("请输入表达式并点击确定（目标：24 ^_^）", undefined);
    }

    function checkAnswer() {
        const input = $("exprInput").value.trim();
        if (!input) {
            setMessage("先输入一个表达式吧。", "bad");
            return;
        }

        try {
            const value = evalExpression(input);
            if (Math.abs(value - TARGET) < EPS) {
                // 先校验是否严格按题目给出的四个数字、且每个数字只用一次
                const usageError = validateNumberUsage(input, currentNumbers);
                if (usageError) {
                    setMessage(usageError, "bad");
                } else {
                    setMessage(`正确！结果 = ${value},真是太聪明啦！`, "ok");
                }
            } else {
                setMessage(`还差一点点：结果 = ${value}，不是 24，加油再试试！`, "bad");
            }
        } catch (err) {
            setMessage(err instanceof Error ? err.message : "表达式解析失败", "bad");
        }
    }

    /**
     * 检查表达式中的数字是否与题目给出的四个数字严格一一对应。
     * - 若有数字漏用或多用：返回 "犯规了哦，每个数字必须用一次且只能用一次"；
     * - 若出现题目中不存在的数字（包括小数）：返回 "犯规了哦，你用了题目里没有的数字"；
     * - 否则返回 null。
     * @param {string} expr
     * @param {number[]} nums
     * @returns {string | null}
     */
    function validateNumberUsage(expr, nums) {
        const clean = expr
            .replaceAll("×", "*")
            .replaceAll("÷", "/")
            .replaceAll("−", "-");
        const tokens = tokenize(clean);

        /** @type {number[]} */
        const used = [];
        for (const t of tokens) {
            if (t.type === "num") {
                const v = Math.abs(t.value);
                used.push(v);
            }
        }

        // 数量不对：肯定不是“每个数字一次且仅一次”
        if (used.length !== nums.length) {
            return "犯规了哦！";
        }

        // 题目数字频次表
        /** @type {Record<string, number>} */
        const need = {};
        for (const n of nums) {
            const k = String(n);
            need[k] = (need[k] ?? 0) + 1;
        }

        for (const v of used) {
            const rounded = Math.round(v);
            // 必须是整数，且在 1~13 范围内
            if (Math.abs(v - rounded) > EPS) {
                return "犯规了哦！";
            }
            const key = String(rounded);
            if (!need[key]) {
                // 题目中没有这个整数，或已经被用完
                return "犯规了哦！";
            }
            need[key]--;
        }

        // 若还有剩余，说明有数字没用到
        for (const k in need) {
            if (Object.prototype.hasOwnProperty.call(need, k) && need[k] !== 0) {
                return "犯规了哦！";
            }
        }
        return null;
    }

    function bindEvents() {
        // 数字点按输入
        $("numbersArea").addEventListener("click", (e) => {
            const target = /** @type {HTMLElement} */ (e.target);
            const btn = target.closest("button[data-num]");
            if (!btn) return;
            const num = btn.getAttribute("data-num");
            if (!num) return;
            appendToken(num);
        });

        // 运算符点按输入（来自 HTML 的 data-token）
        const keypad = document.querySelector(".keypad");
        if (keypad) {
            keypad.addEventListener("click", (e) => {
                const target = /** @type {HTMLElement} */ (e.target);
                const btn = target.closest("button[data-token]");
                if (!btn) return;
                const token = btn.getAttribute("data-token");
                if (!token) return;
                appendToken(token);
            });
        }

        // 只允许点按输入：输入框不接受键盘编辑
        const input = $("exprInput");
        input.addEventListener("keydown", (e) => {
            // 允许 Tab/Escape 的默认行为（不改内容）
            if (e.key === "Tab" || e.key === "Escape") return;

            // 只允许左右方向键移动光标
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") return;

            // Backspace：按与“删除”按钮相同的规则，删掉一个 token
            if (e.key === "Backspace") {
                e.preventDefault();
                deleteAtCursor();
                return;
            }

            // 其它按键（包括数字、运算符、字母、Delete、上下键等）全部拦截，禁止键盘直接修改内容
            e.preventDefault();
        });

        // 从更底层拦截所有输入类操作（包括粘贴、输入法等），彻底禁止键盘修改内容
        input.addEventListener("beforeinput", (e) => {
            // 所有类型一律阻止，实际内容改动只通过按钮和 token 逻辑完成
            e.preventDefault();
        });

        // 防止通过粘贴改变内容
        input.addEventListener("paste", (e) => {
            e.preventDefault();
        });

        // 如果仍然有 input 事件（极端情况下），强制把内容恢复为 token 拼接结果
        input.addEventListener("input", () => {
            rebuildInputFromTokens();
        });

        $("delBtn").addEventListener("click", () => deleteAtCursor());
        $("clearBtn").addEventListener("click", () => {
            inputTokens = [];
            syncInputCaret(0);
            hideHint();
            setMessage("已清空输入", undefined);
        });

        $("checkBtn").addEventListener("click", () => checkAnswer());

        $("newBtn").addEventListener("click", () => newGame());
        $("hintBtn").addEventListener("click", () => toggleHint());
    }

    document.addEventListener("DOMContentLoaded", () => {
        bindEvents();
        newGame();
    });
})();
