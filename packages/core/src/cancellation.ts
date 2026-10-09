/** Structurally compatible with the LSP `CancellationToken`. */
export interface CancellationToken {
	readonly isCancellationRequested: boolean;
}

export class CancellationTokenSource {
	private cancelled = false;
	readonly token: CancellationToken;

	constructor() {
		const source = this;
		this.token = {
			get isCancellationRequested() {
				return source.cancelled;
			},
		};
	}

	cancel() {
		this.cancelled = true;
	}
}

export interface Disposable {
	dispose(): void;
}
