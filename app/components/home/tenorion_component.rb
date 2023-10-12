# frozen_string_literal: true

module Home
  class TenorionComponent < ReactComponent
    def initialize(raw_props)
      super('Tenorion', raw_props:)
    end

    def props
      raw_props.merge
    end
  end
end
