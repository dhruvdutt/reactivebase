import {
	default as React, Component } from 'react';
var ReactDOM = require('react-dom');

import {
	ReactiveBase,
	MultiDropdownList,
	ReactiveList,
	SelectedFilters
} from '../../app/app.js';

import { Img } from "../../app/stories/Img.js";

class Main extends Component {
	constructor(props) {
		super(props);
		this.state = {
			defaultSelected: ["London"]
		};
		this.DEFAULT_IMAGE = "http://www.avidog.com/wp-content/uploads/2015/01/BellaHead082712_11-50x65.jpg";
		this.handleInputChange = this.handleInputChange.bind(this);
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

	handleInputChange(e) {
		const defaultSelected = e.target.value.split(",");
		this.setState({
			defaultSelected
		});
	}

	render() {
		return (
			<ReactiveBase
				app="reactivemap_demo"
				credentials="kvHgC64RP:e96d86fb-a1bc-465e-8756-02661ffebc05"
			>
				<SelectedFilters componentId="SelectedFilters" />
				<div className="row">
					<div className="col s6 col-xs-6">
						<MultiDropdownList
							componentId="CitySensor"
							dataField={this.props.mapping.city}
							title="MultiDropdownList"
							size={100}
							URLParams={true}
							filterLabel="City Label"
							defaultSelected={this.state.defaultSelected}
							onQueryChange={(prev, next) => {
								console.log("prevQuery", prev);
								console.log("nextQuery", next);
							}}
							onValueChange={value => console.log("onValueChange:", value)}
						/>
						<input value={this.state.defaultSelected} onChange={this.handleInputChange} placeholder="defaultSelected" />

						<MultiDropdownList
							componentId="TopicsSensor"
							dataField={this.props.mapping.topic}
							title="queryFormat = and"
							size={100}
							URLParams={true}
							showCount={true}
							filterLabel="Topics"
							queryFormat="and"
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
								and: ["CitySensor", "TopicsSensor"]
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
		city: "group.group_city.raw",
		topic: "group.group_topics.topic_name_raw"
	}
};

ReactDOM.render(<Main />, document.getElementById('map'));
