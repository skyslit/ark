export function compile(schema: any, val?: any): any {
  if (val === undefined) {
    if (Array.isArray(schema)) {
      val = [];
    } else {
      val = {};
    }
  }

  if (Array.isArray(val)) {
    if (Array.isArray(schema) && schema.length === 1) {
      return val.map((v) => compile(schema[0], v));
    } else {
      throw new Error(
        `Schema for an array should contain exactly one schema item`
      );
    }
  } else if (typeof val === 'object') {
    const copy = schema();
    let finalCopy = {};
    finalCopy = Object.keys(copy).reduce((acc, key) => {
      const inflatable = typeof copy[key] === 'function';

      if (inflatable) {
        acc[key] = compile(copy[key], val[key] || {});
      } else {
        const inflatableArray =
          Array.isArray(copy[key]) && copy[key].length === 1;
        if (inflatableArray) {
          acc[key] = compile(copy[key], val[key] || []);
        } else {
          acc[key] = (val && val[key]) || copy[key];
        }
      }

      return acc;
    }, val);

    return finalCopy;
  } else {
    return val;
  }
}

export function createSchema(val: any) {
  return () => Object.assign({}, val);
}
