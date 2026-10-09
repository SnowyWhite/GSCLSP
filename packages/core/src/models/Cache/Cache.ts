import { type CancellationToken, CancellationTokenSource } from "../../cancellation";

export class Cache<T extends object> {
	private data: Partial<T> = {};
	private readonly pending: {
		[K in keyof T]?: { promise: Promise<T[K] | undefined>; tokenSource: CancellationTokenSource };
	} = {};

	get<K extends keyof T>(key: K, getFunc: () => T[K]): T[K] {
		const cached = this.getCached(key);
		if (cached !== undefined) return cached;

		const value = getFunc();
		this.data[key] = value;
		return value;
	}

	async getAsync<K extends keyof T>(
		key: K,
		getFunc: (token: CancellationToken) => Promise<T[K] | undefined>,
	): Promise<T[K]> {
		const cached = this.getCached(key);
		if (cached !== undefined) return cached;

		let pending = this.pending[key];
		let createdPromise = false;
		if (!pending) {
			const tokenSource = new CancellationTokenSource();
			const promise = getFunc(tokenSource.token);
			pending = { promise, tokenSource };
			this.pending[key] = pending;
			createdPromise = true;
		}

		let value: T[K] | undefined;
		try {
			value = await pending.promise;
		} finally {
			if (createdPromise) {
				this.pending[key] = undefined;
			}
		}

		// Retry if the load was invalidated while running, its result may be stale:
		if (value === undefined || pending.tokenSource.token.isCancellationRequested) {
			return this.getAsync(key, getFunc);
		}

		this.data[key] = value;
		return value;
	}

	getCached<K extends keyof T>(key: K): T[K] | undefined {
		return this.data[key];
	}

	delete(key: keyof T) {
		this.data[key] = undefined;
		this.pending[key]?.tokenSource.cancel();
	}

	clear() {
		this.data = {};
		for (const key in this.pending) this.pending[key]?.tokenSource.cancel();
	}
}
