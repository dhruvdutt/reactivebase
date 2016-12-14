import React, { Component } from 'react';
import { AppbaseReactiveMap, SingleList } from '../app.js';

export default class SingleListDefault extends Component {
	render() {
		return (
			<AppbaseReactiveMap config={this.props.config}>
				<div className="col-xs-6">
					<SingleList
						sensorId="CitySensor"
						appbaseField={this.props.mapping.city}
						showCount={true}
						size={1000}
						searchPlaceholder="Search City"
						{...this.props}
					/>
				</div>
			</AppbaseReactiveMap>
		);
	}
}

SingleListDefault.defaultProps = {
	title: 'Cities',
	mapping: {
		city: 'group.group_city.raw'
	},
	config: {
		"appbase": {
			"appname": "meetup_demo",
			"username": "LPpISlEBe",
			"password": "2a8935f5-0f63-4084-bc3e-2b2b4d1a8e02",
			"type": "meetupdata1"
		}
	}
};