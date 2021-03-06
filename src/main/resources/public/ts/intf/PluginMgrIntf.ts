import { TypeHandlerIntf } from "./TypeHandlerIntf";

export interface PluginMgrIntf {
    initPlugins(): any;
    getTypeHandler(typeName: string): TypeHandlerIntf;
    getAllTypeHandlers(): Map<string, TypeHandlerIntf>;
}
