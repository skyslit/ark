export type PlatformVersionDefinition = {
  /**
   * e.g. v1.0
   */
  name: string;
  /**
   * e.g. 1 or 2 or 3
   */
  code: number;
  dependencies: {
    [key: string]: string;
  };
  devDependencies: {
    [key: string]: string;
  };
};

/**
 * Provides functionality for platform version support
 */
export class PlatformVersionManager {
  static instance: PlatformVersionManager;
  /**
   * Creates a singleton instance of the class
   * @return {PlatformVersionManager}
   */
  static getInstance(): PlatformVersionManager {
    if (!PlatformVersionManager.instance) {
      PlatformVersionManager.instance = new PlatformVersionManager();
    }
    return PlatformVersionManager.instance;
  }

  private localRegistry: Array<PlatformVersionDefinition>;

  /**
   * Creates new instance of manager
   */
  constructor() {
    this.localRegistry = [];
  }

  /**
   * Find platform version definitions by id or version
   * @param {string} version
   * @param {number} build
   * @return {PlatformVersionDefinitiont}
   */
  findPlatformVersionDefinition(
    version: string,
    build: number
  ): PlatformVersionDefinition {
    return this.localRegistry.find(
      (d) => d.name === version || d.code === build
    );
  }

  /**
   * Register platform version definitions
   * @param {PlatformVersionDefinition} def
   */
  registerPlatformVersionDefinition(def: PlatformVersionDefinition) {
    if (this.findPlatformVersionDefinition(def.name, def.code)) {
      throw new Error(
        `Duplicate registration is attempted, version: ${def.name}, code: ${def.code}`
      );
    }
    this.localRegistry.push(def);
  }

  /**
   * Gets platform version definitions
   * @param {string | number} id
   * @return {Promise<PlatformVersionDefinition>}
   */
  getPlatformVersionDefinition(
    id: string | number
  ): Promise<PlatformVersionDefinition> {
    return new Promise((resolve, reject) => {
      const versionName: string = typeof id === 'string' ? id : null;
      const versionCode: number = typeof id === 'number' ? id : null;

      resolve(this.findPlatformVersionDefinition(versionName, versionCode));
    });
  }
}

export default PlatformVersionManager.getInstance();
