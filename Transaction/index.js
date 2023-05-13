'use strict';

const crypto = require('node:crypto');
const color = require('cli-color');

class TransactionBaseService {
	constructor() {
		this.events = {
			commit: [],
			rollback: [],
			timeout: [],
		};
		this.logs = [];
	}

	commit(target, detla) {
		this.#_emit('commit', target, detla);
	}

	rollback(target, detla) {
		this.#_emit('rollback', target, detla);
	}

	on(target, detla, name, callback) {
		const event = this.events[name];

		event && event.push(callback);
	}

	#_emit(name, target, delta) {
		const event = this.events[name];

		for (const listener of event) listener(target, delta);
	}

	createLog(target, delta, operation) {
		const log = `
${color.bold.blue('--------------')}
${color.bold.greenBright('ID')}: ${color.blue(target.id)}
${color.bold.greenBright('TIME')}: ${color.blue(new Date())}
${color.bold.greenBright('OPERATION')}: ${color.blue(operation)}
${color.bold.greenBright('DELTA')}: ${color.blue(JSON.stringify(delta, null, 2))}
${color.bold.blue('--------------')}
		`;

		this.#_addLog(log);
	}

	#_addLog(log) {
		this.logs.push(log);

		this.#_showLogs();
	}

	#_showLogs() {
		console.group(color.bold.green('LOGS: '));
		this.logs.forEach((log) => console.log(log));
		console.groupEnd();

		this.logs = [];
	}
}

class ProxyHandlers {
	constructor(transactionContext) {
		this.transactionContext = transactionContext;
	}

	static getInstance() {
		return new ProxyHandlers(...arguments);
	}

	getHandlers() {
		const proxyHandlersContext = this;
		const transaction = this.transactionContext;

		return {
			get() {
				return (target, key) => {
					console.log(`Get key: ${key}`);
					console.log(`ID: ${target.id} \n`);

					if (key === Symbol.iterator) return proxyHandlersContext.getKeys();

					if (transaction[key] && typeof transaction[key] === 'function')
						return transaction[key].bind(transaction, target, transaction.deltaset[target.id]);

					if (transaction.deltaset[target.id]?.hasOwnProperty(key)) return transaction.deltaset[target.id][key];

					return target[key];
				};
			},

			set() {
				return (target, key, val) => {
					console.log(`Set key: ${key} - val: ${val}`);
					console.log(`ID: ${target.id} \n`);

					if (target[key] === val) delete transaction.deltaset[target.id][key];
					else transaction.deltaset[target.id][key] = val;

					return true;
				};
			},

			ownKeys() {
				return (target) => proxyHandlersContext.getKeys(target);
			},

			getOwnPropertyDescriptor() {
				return (target, key) =>
					Object.getOwnPropertyDescriptor(
						transaction.deltaset[target.id].hasOwnProperty(key) ? transaction.deltaset[target.id] : target,
						key,
					);
			},
		};
	}

	getKeys(target) {
		const targetChanges = Object.keys(this.transactionContext.deltaset[target.id]);
		const keys = Object.keys(target).concat(targetChanges);

		return keys.filter(
			(targetField, targetIndex, keysArr) => keysArr.indexOf(targetField) === targetIndex && targetField !== 'id',
		);
	}
}

class Transaction extends TransactionBaseService {
	#_ProxyHandlers = ProxyHandlers.getInstance;
	#_defaultData;

	constructor(data, commonMethods = {}) {
		super();

		this.#_defaultData = data;
		this.deltaset = {};
		this.dataset = this.#_parseData(data, commonMethods);
	}

	static getInstance(data, commonMethods) {
		return new Transaction(...arguments);
	}

	commit(target, detla) {
		super.createLog(...arguments, 'commit');
		Object.assign(target, detla);
		this.deltaset[target.id] = {};

		super.commit(...arguments);
	}

	rollback(target, detla) {
		super.createLog(...arguments, 'rollback');
		this.deltaset[target.id] = {};

		super.rollback(...arguments);
	}

	on(target, detla, event, callback) {
		super.on(...arguments);
	}

	clone(target, detla) {
		const cloned = Transaction.getInstance(this.#_defaultData);
		Object.assign(cloned.deltaset, this.deltaset);

		super.createLog(...arguments, 'clone');

		return cloned;
	}

	delta(target, detla) {
		super.createLog(target, detla, 'get delta');

		return detla;
	}

	#_mutateData(parseData) {
		return parseData.map((dataItem) => {
			const id = crypto.randomUUID();

			return this.#_proxyWrapper({ id, ...dataItem });
		});
	}

	#_proxyWrapper(target) {
		const proxyHandlers = this.#_ProxyHandlers(this).getHandlers();

		this.deltaset[target.id] = {};

		return new Proxy(target, {
			get: proxyHandlers.get(),

			set: proxyHandlers.set(),

			getOwnPropertyDescriptor: proxyHandlers.getOwnPropertyDescriptor(),

			ownKeys: proxyHandlers.ownKeys(),
		});
	}

	#_parseData(data, commonMethods) {
		const commonMethodsKeys = Object.keys(commonMethods);

		if (commonMethodsKeys.length) {
			data.map((item) => Object.setPrototypeOf(item, commonMethods));
		}

		return this.#_mutateData(data);
	}
}

const data = [
	{ name: 'Marcus Aurelius', born: 121 },
	{ name: 'Mark Hel', born: 52 },
	{ name: 'Tome Biri', born: 45 },
];

const commonMethods = {
	getName() {
		return this.name;
	},
};

// start

const transaction = Transaction.getInstance(data, commonMethods);

// set new fields to delta

// transaction.dataset[0].born = 122;
// transaction.dataset[0].newField = 'new Info';

// ----

// get keys && own keys

// for (const key in transaction.dataset[0]) {
// 	console.log(key);
// }

// ----

// commit

// console.log(transaction.dataset[0]);

// transaction.dataset[0].delta();

// get commit event

// transaction.dataset[0].on('commit', (target) => {
// 	console.log('TARGET FROM EVENT COMMIT: ', target);
// });

// transaction.dataset[0].commit();

// console.log(transaction.dataset[0]);

// transaction.dataset[0].delta();

// ----

// clone

// const clone = transaction.dataset[0].clone();

// console.log(clone);

// ----

// rollback;

// console.log(transaction.dataset[0]);

// transaction.dataset[0].delta();

// get rollback event

// transaction.dataset[0].on('rollback', (target) => {
// 	console.log('TARGET FROM EVENT ROLLBACK: ', target);
// });

// transaction.dataset[0].rollback();

// console.log(transaction.dataset[0]);

// transaction.dataset[0].delta();
