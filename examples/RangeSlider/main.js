import {
	default as React, Component } from 'react';
var ReactDOM = require('react-dom');

import {
	ReactiveBase,
	RangeSlider,
	MultiList,
	ReactiveList
} from '../../app/app.js';

import { Img } from "../../app/stories/Img.js";

class Main extends Component {
	constructor(props) {
		super(props);
		this.DEFAULT_IMAGE = "http://www.avidog.com/wp-content/uploads/2015/01/BellaHead082712_11-50x65.jpg";
	}

	onData(markerData) {
		const marker = markerData._source;
		return (
			<a
				className="full_row single-record single_record_for_clone"
				href={marker.event ? marker.event.event_url : ""}
				target="_blank"
				key={markerData._id}
			>
				<div className="img-container">
					<Img key={markerData._id} src={marker.member ? marker.member.photo : this.DEFAULT_IMAGE} />
				</div>
				<div className="text-container full_row">
					<div className="text-head text-overflow full_row">
						<span className="text-head-info text-overflow">
							{marker.member ? marker.member.member_name : ""} is going to {marker.event ? marker.event.event_name : ""}
						</span>
						<span className="text-head-city">{marker.group ? marker.group.group_city : ""}</span>
					</div>
					<div className="text-description text-overflow full_row">
						<ul className="highlight_tags">
							{
								marker.group.group_topics.map((tag, i) => (<li key={i}>{tag.topic_name}</li>))
							}
						</ul>
					</div>
				</div>
			</a>
		);
	}

	render() {
		return (
			<ReactiveBase
				app="reactivemap_demo"
				credentials="kvHgC64RP:e96d86fb-a1bc-465e-8756-02661ffebc05"
			>
				<div className="row">
					<div className="col s6 col-xs-6">
						<MultiList
							componentId="TopicSensor"
							dataField="group.group_topics.topic_name_raw.raw"
							title="MultiList"
							size={100}
							selectAllLabel="Select All"
							defaultSelected={["Social"]}
							URLParams={true}
							showCount={true}
							showCheckbox={true}
							showSearch={true}
							queryFormat="or"
							filterLabel="Topic Label"
							onValueChange={value => console.log("onValueChange:", value)}
						/>
						<RangeSlider
							componentId="RangeSensor"
							dataField={this.props.mapping.guests}
							stepValue={2}
							title="RangeSlider"
							range={{
								start: 0,
								end: 8
							}}
							defaultSelected={{
								start: 0,
								end: 4
							}}
							rangeLabels={{
								start: "0",
								end: "8"
							}}
							URLParams={true}
							onQueryChange={(prev, next) => {
								console.log("prevQuery", prev);
								console.log("nextQuery", next);
							}}
							onValueChange={(value) => {console.log("value changed to", value)}}
							beforeValueChange={() => new Promise((resolve) => resolve())}
							react={{
								and: "TopicSensor"
							}}
						/>
					</div>

					<div className="col s6 col-xs-6">
						<ReactiveList
							componentId="SearchResult"
							dataField={this.props.mapping.topic}
							title="Results"
							sortBy="asc"
							from={0}
							size={20}
							onData={this.onData}
							react={{
								and: ["TopicSensor", "RangeSensor"]
							}}
						/>
					</div>
				</div>
			</ReactiveBase>
		);
	}
}

Main.defaultProps = {
	mapping: {
		guests: "guests",
		topic: "group.group_topics.topic_name_raw"
	}
};


ReactDOM.render(<Main />, document.getElementById('map'));
