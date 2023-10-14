# frozen_string_literal: true

class HomeController < ApplicationController
  skip_before_action :require_sign_in, only: %i[index]

  def index; end
end
