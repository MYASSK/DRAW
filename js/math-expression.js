// Small numeric expression language. No JavaScript execution or property lookup.
const FUNCTIONS = new Map([
    ['floor', [Math.floor, 1, 1]], ['ceil', [Math.ceil, 1, 1]],
    ['round', [Math.round, 1, 1]], ['abs', [Math.abs, 1, 1]],
    ['pow', [Math.pow, 2, 2]], ['sqrt', [Math.sqrt, 1, 1]],
    ['log', [Math.log, 1, 1]], ['log2', [Math.log2, 1, 1]],
    ['log10', [Math.log10, 1, 1]], ['sin', [Math.sin, 1, 1]],
    ['cos', [Math.cos, 1, 1]], ['tan', [Math.tan, 1, 1]],
    ['min', [Math.min, 1, 32]], ['max', [Math.max, 1, 32]],
    ['random', [Math.random, 0, 0]],
]);
const BINARY = {
    '+': (a, b) => a + b, '-': (a, b) => a - b,
    '*': (a, b) => a * b, '/': (a, b) => a / b,
    '%': (a, b) => a % b, '**': (a, b) => a ** b,
    '<': (a, b) => +(a < b), '<=': (a, b) => +(a <= b),
    '>': (a, b) => +(a > b), '>=': (a, b) => +(a >= b),
    '==': (a, b) => +(a === b), '===': (a, b) => +(a === b),
    '!=': (a, b) => +(a !== b), '!==': (a, b) => +(a !== b),
};

function finite(value) {
    if (!Number.isFinite(value)) throw new Error('Expression produced a non-finite number');
    return value;
}

function tokenize(source) {
    if (typeof source !== 'string' || !source.trim()) throw new Error('Enter an expression');
    if (source.length > 1024) throw new Error('Expression is too long');
    const tokens = [];
    let pos = 0;
    while (pos < source.length) {
        const rest = source.slice(pos);
        const space = /^\s+/.exec(rest);
        if (space) { pos += space[0].length; continue; }
        const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
        const name = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(rest);
        const operator = /^(?:===|!==|\*\*|<=|>=|==|!=|[+\-*/%<>()?,:.])/.exec(rest);
        if (number) tokens.push({ type: 'number', value: finite(Number(number[0])) });
        else if (name) tokens.push({ type: 'name', value: name[0] });
        else if (operator) tokens.push({ type: 'operator', value: operator[0] });
        else throw new Error(`Unexpected character at position ${pos + 1}`);
        pos += (number || name || operator)[0].length;
        if (tokens.length > 256) throw new Error('Expression is too complex');
    }
    tokens.push({ type: 'end', value: '' });
    return tokens;
}

/** Compile an allowlisted numeric expression to safe interpreter closures. */
export function compileExpression(source) {
    const tokens = tokenize(source);
    let index = 0;
    const peek = () => tokens[index].value;
    const take = (value) => {
        if (peek() !== value) return false;
        index++;
        return true;
    };
    const expect = (value) => {
        if (!take(value)) throw new Error(`Expected ${value}`);
    };
    const combine = (left, op, right) => x => finite(BINARY[op](left(x), right(x)));
    const binaryLevel = (next, operators) => {
        let result = next();
        while (operators.includes(peek())) {
            const op = tokens[index++].value;
            result = combine(result, op, next());
        }
        return result;
    };
    function conditional() {
        const condition = equality();
        if (!take('?')) return condition;
        const yes = conditional();
        expect(':');
        const no = conditional();
        return x => condition(x) ? yes(x) : no(x);
    }
    function equality() { return binaryLevel(comparison, ['==', '!=', '===', '!==']); }
    function comparison() { return binaryLevel(additive, ['<', '<=', '>', '>=']); }
    function additive() { return binaryLevel(multiplicative, ['+', '-']); }
    function multiplicative() { return binaryLevel(unary, ['*', '/', '%']); }
    function unary() {
        if (take('+')) return unary();
        if (take('-')) { const value = unary(); return x => finite(-value(x)); }
        return power();
    }
    function power() {
        const base = primary();
        return take('**') ? combine(base, '**', unary()) : base;
    }
    function primary() {
        const token = tokens[index++];
        if (token.type === 'number') return () => token.value;
        if (token.value === '(') {
            const value = conditional();
            expect(')');
            return value;
        }
        if (token.type !== 'name') throw new Error('Expected a number, x, or Math function');
        if (token.value === 'x') return x => x;
        if (token.value !== 'Math') throw new Error(`Unknown name: ${token.value}`);
        expect('.');
        const member = tokens[index++];
        if (member.type !== 'name') throw new Error('Expected a Math function or constant');
        if (member.value === 'PI') return () => Math.PI;
        if (member.value === 'E') return () => Math.E;
        const definition = FUNCTIONS.get(member.value);
        if (!definition) throw new Error(`Unsupported Math function: ${member.value}`);
        expect('(');
        const args = [];
        if (!take(')')) {
            do { args.push(conditional()); } while (take(','));
            expect(')');
        }
        const [fn, min, max] = definition;
        if (args.length < min || args.length > max) throw new Error(`Wrong argument count for Math.${member.value}`);
        return x => finite(fn(...args.map(arg => arg(x))));
    }
    const evaluate = conditional();
    if (tokens[index].type !== 'end') throw new Error(`Unexpected token: ${peek()}`);
    return x => finite(evaluate(finite(x)));
}
