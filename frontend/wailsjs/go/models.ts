export namespace frontend {
	
	export class FileFilter {
	    DisplayName: string;
	    Pattern: string;
	
	    static createFrom(source: any = {}) {
	        return new FileFilter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.DisplayName = source["DisplayName"];
	        this.Pattern = source["Pattern"];
	    }
	}

}

export namespace main {
	
	export class AppConfig {
	    language: string;
	    alwaysOnTop: boolean;
	    getRestoreState: boolean;
	    bsdiffMaxFileSize: number;
	    autoBaseGenerationThreshold: number;
	    i18n: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new AppConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.language = source["language"];
	        this.alwaysOnTop = source["alwaysOnTop"];
	        this.getRestoreState = source["getRestoreState"];
	        this.bsdiffMaxFileSize = source["bsdiffMaxFileSize"];
	        this.autoBaseGenerationThreshold = source["autoBaseGenerationThreshold"];
	        this.i18n = source["i18n"];
	    }
	}
	export class BackupItem {
	    fileName: string;
	    filePath: string;
	    timestamp: string;
	    FileSize: number;
	    generation: number;
	
	    static createFrom(source: any = {}) {
	        return new BackupItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fileName = source["fileName"];
	        this.filePath = source["filePath"];
	        this.timestamp = source["timestamp"];
	        this.FileSize = source["FileSize"];
	        this.generation = source["generation"];
	    }
	}
	export class DiffFileInfo {
	    fileName: string;
	    filePath: string;
	    timestamp: string;
	    fileSize: number;
	
	    static createFrom(source: any = {}) {
	        return new DiffFileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fileName = source["fileName"];
	        this.filePath = source["filePath"];
	        this.timestamp = source["timestamp"];
	        this.fileSize = source["fileSize"];
	    }
	}

}

