# frozen_string_literal: true

class ReactComponent < ViewComponent::Base
  attr_reader :component, :raw_props

  def initialize(component, raw_props: {})
    super
    @component = component
    @raw_props = raw_props
  end

  def call
    helpers.tag.div(
      '',
      data: {
        react_component: component,
        props:
      },
      class: 'd-flex flex flex-column align-items-stretch flex-grow-1 flex-shrink-0'
    )
  end

  private

  def props
    raw_props
  end
end
