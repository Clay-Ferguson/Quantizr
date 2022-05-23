package quanta.actpub.model;

import static quanta.util.Util.ok;
import quanta.actpub.APConst;

/**
 * Delete object.
 */
public class APODelete extends APObj {
    public APODelete() {
        put(context, new APList() //
                .val(APConst.CONTEXT_STREAMS) //
                .val(new APOLanguage()));
        put(type, APType.Delete);
    }

    public APODelete(String id, String actor, APObj object, APList to) {
        this();
        put(APObj.id, id);
        put(APObj.actor, actor);
        put(APObj.object, object);
        if (ok(to)) {
            put(APObj.to, to);
        }
    }

    @Override
    public APODelete put(String key, Object val) {
        super.put(key, val);
        return this;
    }
}