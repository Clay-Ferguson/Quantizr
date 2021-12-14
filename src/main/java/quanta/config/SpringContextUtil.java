package quanta.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.stereotype.Component;
import quanta.AppController;
import quanta.exception.base.RuntimeEx;
import quanta.mongo.MongoRepository;
import quanta.service.IPFSPubSub;
import quanta.util.EnglishDictionary;
import static quanta.util.Util.*;

/**
 * Manages certain aspects of Spring application context.
 */
@Component
public class SpringContextUtil implements ApplicationContextAware {
	private static final Logger log = LoggerFactory.getLogger(SpringContextUtil.class);

	private static ApplicationContext context;

	@Autowired
	private MongoRepository mongoRepo;

	@Autowired
	private AppController appController;

	@Autowired
	private EnglishDictionary english;

	@Autowired
	private TestRunner testRunner;

	@Autowired
	private IPFSPubSub pubSub;

	@Override
	public void setApplicationContext(ApplicationContext context) throws BeansException {
		log.debug("SpringContextUtil initialized context.");
		SpringContextUtil.context = context;
		try {
			mongoRepo.init();
			appController.init();
			english.init();
			pubSub.init();
		} catch (Exception e) {
			log.error("application startup failed.");
			throw new RuntimeEx(e);
		}
		testRunner.test();
	}

	public static ApplicationContext getApplicationContext() {
		return context;
	}

	public static Object getBean(Class clazz) {
		if (no(context)) {
			throw new RuntimeEx("SpringContextUtil accessed before spring initialized.");
		}

		return context.getBean(clazz);
	}

	public static Object getBean(String name) {
		if (no(context)) {
			throw new RuntimeEx("SpringContextUtil accessed before spring initialized.");
		}

		return context.getBean(name);
	}
}