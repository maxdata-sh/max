export class SimpleError<TProps extends object> extends Error {
  constructor(public props: TProps & Partial<{message?: string}>) {
    // @ts-ignore
    super(props['msg'] || props['message'] || '(empty msg)');
    this.name = this.constructor.name

  }

  static Empty = class SimpleErrorEmpty extends SimpleError<{}> {
    constructor(message?: string) {
      super({
        message: message
      });
    }
  }
}


// This is what i ended up using in the end - i never finished the ideas in the other two files

// example usage:
// defining an error
export class ErrMaxwellFieldNotAvailable extends SimpleError<{
  field: string
  atomId: string
}>{}

// using it
if (!this.exists()) {
	throw new ErrMaxwellFieldNotAvailable({
		field: this.fieldName,
		atomId: this.ref.toAtomId()
	})
}
