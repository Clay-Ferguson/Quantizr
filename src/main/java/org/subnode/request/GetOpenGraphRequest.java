package org.subnode.request;

import org.subnode.request.base.RequestBase;

public class GetOpenGraphRequest extends RequestBase {
	private String url;

	public String getUrl() {
		return url;
	}

	public void setUrl(String url) {
		this.url = url;
	}	
}