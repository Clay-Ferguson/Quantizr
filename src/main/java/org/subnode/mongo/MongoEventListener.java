package org.subnode.mongo;

import java.util.Calendar;
import java.util.Date;
import org.apache.commons.codec.digest.DigestUtils;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.mapping.event.AbstractMongoEventListener;
import org.springframework.data.mongodb.core.mapping.event.AfterConvertEvent;
import org.springframework.data.mongodb.core.mapping.event.AfterLoadEvent;
import org.springframework.data.mongodb.core.mapping.event.AfterSaveEvent;
import org.springframework.data.mongodb.core.mapping.event.BeforeDeleteEvent;
import org.springframework.data.mongodb.core.mapping.event.BeforeSaveEvent;
import org.subnode.actpub.ActPubService;
import org.subnode.config.NodeName;
import org.subnode.model.client.NodeProp;
import org.subnode.mongo.model.SubNode;
import org.subnode.util.ThreadLocals;
import org.subnode.util.XString;

public class MongoEventListener extends AbstractMongoEventListener<SubNode> {

	private static final Logger log = LoggerFactory.getLogger(MongoEventListener.class);
	private static final boolean verbose = false;

	@Autowired
	private MongoTemplate ops;

	@Autowired
	private MongoRead read;

	@Autowired
	private MongoAuth auth;

	@Autowired
	private ActPubService actPub;

	@Autowired
	private MongoUtil mongoUtil;

	/**
	 * What we are doing in this method is assigning the ObjectId ourselves, because our path must
	 * include this id at the very end, since the path itself must be unique. So we assign this prior to
	 * persisting so that when we persist everything is perfect.
	 * 
	 * WARNING: updating properties on 'node' in here has NO EFFECT. Always update dbObj only!
	 */
	@Override
	public void onBeforeSave(BeforeSaveEvent<SubNode> event) {
		SubNode node = event.getSource();
		log.trace("MDB save: " + node.getPath() + " thread: " + Thread.currentThread().getName());

		Document dbObj = event.getDocument();
		ObjectId id = node.getId();
		boolean isNew = false;

		/*
		 * Note: There's a special case in MongoApi#createUser where the new User root node ID is assigned
		 * there, along with setting that on the owner property so we can do one save and have both updated
		 */
		if (id == null) {
			id = new ObjectId();
			node.setId(id);
			isNew = true;
			// log.debug("New Node ID generated: " + id);
		}
		dbObj.put(SubNode.FIELD_ID, id);

		// Force ordinal to have an integer value (non-null). How to do
		// "constraints" in MongoDB (todo-1)
		if (node.getOrdinal() == null) {
			node.setOrdinal(0L);
			dbObj.put(SubNode.FIELD_ORDINAL, 0L);
		}

		// log.debug("onBeforeSave: ID: " + node.getId().toHexString());

		// DO NOT DELETE
		/*
		 * If we ever add a unique-index for "Name" (not currently the case), then we'd need something like
		 * this to be sure each node WOULD have a unique name.
		 */
		// if (StringUtils.isEmpty(node.getName())) {
		// node.setName(id.toHexString())
		// }

		/* if no owner is assigned... */
		if (node.getOwner() == null) {
			/*
			 * if we are saving the root node, we make it be the owner of itself. This is also the admin owner,
			 * and we only allow this to run during initialiation when the server may be creating the database,
			 * and is not yet processing user requests
			 */
			if (node.getPath().equals("/" + NodeName.ROOT) && !MongoRepository.fullInit) {
				dbObj.put(SubNode.FIELD_OWNER, id);
				node.setOwner(id);
			} else {
				if (auth.getAdminSession() != null) {
					ObjectId ownerId = auth.getAdminSession().getUserNodeId();
					dbObj.put(SubNode.FIELD_OWNER, ownerId);
					node.setOwner(ownerId);
					log.debug("Assigning admin as owner of node that had no owner (on save): " + id);
				}
			}
		}

		if (ThreadLocals.getParentCheckEnabled()) {
			read.checkParentExists(null, node);
		}

		Date now = null;

		/* If no create/mod time has been set, then set it */
		if (node.getCreateTime() == null) {
			if (now == null) {
				now = Calendar.getInstance().getTime();
			}
			dbObj.put(SubNode.FIELD_CREATE_TIME, now);
			node.setCreateTime(now);
		}

		if (node.getModifyTime() == null) {
			if (now == null) {
				now = Calendar.getInstance().getTime();
			}
			dbObj.put(SubNode.FIELD_MODIFY_TIME, now);
			node.setModifyTime(now);
		}

		/*
		 * New nodes can be given a path where they will allow the ID to play the role of the leaf 'name'
		 * part of the path
		 */
		if (node.getPath().endsWith("/?")) {
			String path = mongoUtil.findAvailablePath(XString.removeLastChar(node.getPath()));
			dbObj.put(SubNode.FIELD_PATH, path);
			node.setPath(path);
		}

		saveAuthByThread(node, isNew);

		/* Node name not allowed to contain : or ~ */
		String nodeName = node.getName();
		if (nodeName != null) {
			nodeName = nodeName.replace(":", "-");
			nodeName = nodeName.replace("~", "-");
			nodeName = nodeName.replace("/", "-");

			// Warning: this is not a redundant null check. Some code in this block CAN set
			// to null.
			if (nodeName != null) {
				dbObj.put(SubNode.FIELD_NAME, nodeName);
				node.setName(nodeName);
			}
		}

		removeDefaultProps(node);

		if (node.getAc() != null) {
			/*
			 * we need to ensure that we never save an empty Acl, but null instead, because some parts of the
			 * code assume that if the AC is non-null then there ARE some shares on the node.
			 * 
			 * This 'fix' only started being necessary I think once I added the safeGetAc, and that check ends
			 * up causing the AC to contain an empty object sometimes
			 */
			if (node.getAc().size() == 0) {
				node.setAc(null);
				dbObj.put(SubNode.FIELD_AC, null);
			}
			// Remove any share to self because that never makes sense
			else {
				if (node.getOwner() != null) {
					if (node.getAc().remove(node.getOwner().toHexString()) != null) {
						dbObj.put(SubNode.FIELD_AC, node.getAc());
					}
				}
			}
		}

		ThreadLocals.clean(node);
	}

	/*
	 * For properties that are being set to their default behaviors as if the property didn't exist
	 * (such as vertical layout is assumed if no layout property is specified) we remove those
	 * properties when the client is passing them in to be saved, or from any other source they are
	 * being passed to be saved
	 */
	public void removeDefaultProps(SubNode node) {

		/* If layout=="v" then remove the property */
		String layout = node.getStrProp(NodeProp.LAYOUT.s());
		if ("v".equals(layout)) {
			node.deleteProp(NodeProp.LAYOUT.s());
		}

		/* If priority=="0" then remove the property */
		String priority = node.getStrProp(NodeProp.PRIORITY.s());
		if ("0".equals(priority)) {
			node.deleteProp(NodeProp.PRIORITY.s());
		}
	}

	@Override
	public void onAfterSave(AfterSaveEvent<SubNode> event) {
		SubNode node = event.getSource();
		if (node != null) {
			ThreadLocals.cacheNode(node);
		}
	}

	@Override
	public void onAfterLoad(AfterLoadEvent<SubNode> event) {
		// Document dbObj = event.getDocument();
		// log.debug("onAfterLoad:
		// id="+dbObj.getObjectId(SubNode.FIELD_ID).toHexString());
	}

	@Override
	public void onAfterConvert(AfterConvertEvent<SubNode> event) {
		SubNode node = event.getSource();
		if (node.getOwner() == null) {
			if (auth.getAdminSession() != null) {
				ObjectId ownerId = auth.getAdminSession().getUserNodeId();
				node.setOwner(ownerId);
				log.debug("Assigning admin as owner of node that had no owner (on load): " + node.getId().toHexString());
			}
		}

		ThreadLocals.cacheNode(node);
	}

	@Override
	public void onBeforeDelete(BeforeDeleteEvent<SubNode> event) {
		Document doc = event.getDocument();

		if (doc != null) {
			Object id = doc.get("_id");
			if (id instanceof ObjectId) {
				SubNode node = ops.findById(id, SubNode.class);
				if (node != null) {
					log.trace("MDB del: " + node.getPath());
					auth.ownerAuthByThread(node);
					ThreadLocals.clean(node);
				}
				// because nodes can be orphaned, we clear the entire cache any time any nodes are deleted
				ThreadLocals.clearCachedNodes();
				actPub.deleteNodeNotify((ObjectId) id);
			}
		}
	}

	/* To save a node you must own the node and have WRITE access to it's parent */
	public void saveAuthByThread(SubNode node, boolean isNew) {
		// during server init no auth is required.
		if (!MongoRepository.fullInit) {
			return;
		}
		if (verbose)
			log.trace("saveAuth in MongoListener");

		MongoSession ms = ThreadLocals.getMongoSession();
		if (ms != null) {
			if (ms.isAdmin())
				return;

			// Must have write privileges to this node or one of it's parents.
			auth.ownerAuthByThread(node);

			// only if this is creating a new node do we need to chech that the parent will allow it
			if (isNew) {
				SubNode parent = read.getParent(ms, node);
				if (parent == null)
					throw new RuntimeException("unable to get node parent: " + node.getParentPath());

				auth.authForChildNodeCreate(ms, parent);
			}
		}
	}
}
