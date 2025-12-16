(() => {
    "use strict";

    const EPS = 1e-6;
    const TARGET = 24;

    /** @type {number[]} */
    let currentNumbers = [];
    /** @type {string | null} */
    let currentSolution = null;

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
            const card = document.createElement("div");
            card.className = "num";
            card.innerHTML = `<div class="num-value">${n}</div>`;
            numbersArea.appendChild(card);
        }
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
    }

    function showHint() {
        const hintArea = $("hintArea");
        const hintExpr = $("hintExpr");
        if (!currentSolution) {
            hintExpr.textContent = "这组数字好像没有解（理论上不该出现）";
            hintArea.hidden = false;
            return;
        }
        hintExpr.textContent = formatExprForUser(currentSolution);
        hintArea.hidden = false;
    }

    function newGame() {
        setMessage("正在生成可解题目…", undefined);
        hideHint();
        $("exprInput").value = "";

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
            setMessage("生成失败：请再点一次“换一组”", "bad");
            return;
        }

        currentNumbers = nums;
        currentSolution = sol;
        renderNumbers(currentNumbers);
        setMessage("请输入表达式并提交（目标：24）", undefined);
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
                setMessage(`正确！结果 = ${value}`, "ok");
            } else {
                setMessage(`还差一点：结果 = ${value}，不是 24。`, "bad");
            }
        } catch (err) {
            setMessage(err instanceof Error ? err.message : "表达式解析失败", "bad");
        }
    }

    function bindEvents() {
        $("newBtn").addEventListener("click", () => newGame());
        $("hintBtn").addEventListener("click", () => {
            showHint();
            setMessage("已显示提示答案（仅供参考）", undefined);
        });
        $("checkBtn").addEventListener("click", () => checkAnswer());
        $("clearBtn").addEventListener("click", () => {
            $("exprInput").value = "";
            setMessage("已清空输入。", undefined);
        });
        $("exprInput").addEventListener("keydown", (e) => {
            if (e.key === "Enter") checkAnswer();
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        bindEvents();
        newGame();
    });
})();
