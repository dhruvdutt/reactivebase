import React from 'react';
import { ReactiveBase, ToggleButton, ReactiveList } from '../../app/app.js';
import {config} from './config';
import renderer from 'react-test-renderer';

function testComponent(cb) {
	const onData = function(res, err) {
		cb(res, err);
	}
	const component = renderer.create(
		<ReactiveBase
				app={config.ReactiveBase.app}
				credentials={`${config.ReactiveBase.username}:${config.ReactiveBase.password}`}

				type={config.ReactiveBase.type}
			>
			<div className="row">
				<div className="col s6 col-xs-6">
					<ToggleButton
						componentId="CitySensor"
						dataField={config.mapping.topic}
						title="ToggleButton"
						data={config.ToggleButton.data}
						defaultSelected={config.ToggleButton.defaultSelected}
						size={100}
					/>
				</div>
				<div className="col s6 col-xs-6">
					<ReactiveList
						componentId="SearchResult"
						dataField={config.mapping.topic}
						title="Results"
						sortBy={config.ReactiveList.sortBy}
						from={config.ReactiveList.from}
						size={config.ReactiveList.size}
						onData={onData}
						requestOnScroll={true}
						react={{
							'and': ["CitySensor"]
						}}
					/>
				</div>
			</div>
		</ReactiveBase>
	);
}
export var ToggleButtonTest = function() {
	return new Promise((resolve, reject) => {
		testComponent(function(res,err) {
			if (err) {
				reject(err);
			} else if (res) {
				resolve(res);
			}
		});
	});
}
