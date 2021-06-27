package org.subnode.service;

import java.io.BufferedInputStream;
import org.apache.commons.io.input.AutoCloseInputStream;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.subnode.config.SpringContextUtil;
import org.subnode.mongo.MongoRead;
import org.subnode.mongo.MongoSession;
import org.subnode.mongo.MongoThreadLocal;
import org.subnode.mongo.MongoUpdate;
import org.subnode.mongo.model.SubNode;
import org.subnode.util.ExUtil;
import org.subnode.util.StreamUtil;

@Component
public class ImportService {
	private static final Logger log = LoggerFactory.getLogger(ImportService.class);

	@Autowired
	private MongoRead read;

	@Autowired
	private MongoUpdate update;

	public ResponseEntity<?> streamImport(MongoSession session, String nodeId, MultipartFile[] uploadFiles) {
		if (nodeId == null) {
			throw ExUtil.wrapEx("target nodeId not provided");
		}
		session = MongoThreadLocal.ensure(session);

		SubNode node = read.getNode(session, nodeId);
		if (node == null) {
			throw ExUtil.wrapEx("Node not found.");
		}

		if (uploadFiles.length != 1) {
			throw ExUtil.wrapEx("Multiple file import not allowed");
		}

		MultipartFile uploadFile = uploadFiles[0];

		String fileName = uploadFile.getOriginalFilename();
		if (!StringUtils.isEmpty(fileName)) {
			log.debug("Uploading file: " + fileName);

			BufferedInputStream in = null;
			try {
				if (fileName.toLowerCase().endsWith(".zip")) {
					log.debug("Import ZIP to Node: " + node.getPath());
					in = new BufferedInputStream(new AutoCloseInputStream(uploadFile.getInputStream()));

					ImportZipService importZipService = (ImportZipService) SpringContextUtil
							.getBean(ImportZipService.class);
					importZipService.importFromStream(session, in, node, false);
					update.saveSession(session);
				}
				else if (fileName.toLowerCase().endsWith(".tar")) {
					log.debug("Import TAR to Node: " + node.getPath());
					in = new BufferedInputStream(new AutoCloseInputStream(uploadFile.getInputStream()));

					ImportTarService importTarService = (ImportTarService)
					SpringContextUtil.getBean(ImportTarService.class);
					importTarService.importFromStream(session, in, node, false);
					update.saveSession(session);
				} else {
					throw ExUtil.wrapEx("Only ZIP or TAR files are supported for importing.");
				}
			} catch (Exception ex) {
				throw ExUtil.wrapEx(ex);
			} finally {
				StreamUtil.close(in);
			}
		}

		return new ResponseEntity<>(HttpStatus.OK);
	}
}
